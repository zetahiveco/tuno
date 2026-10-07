import { createHash, randomBytes } from "node:crypto";
import type { ReactElement } from "react";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { downloadFileFromS3, listS3KeysWithPrefix, uploadFileToS3Key } from "@/lib/file";

/**
 * S3-backed "remote git" for generated websites.
 *
 * Layout inside the bucket:
 *   websites/{websiteId}/commits/{sha}/manifest.json  — commit metadata + file list
 *   websites/{websiteId}/commits/{sha}/{path}         — individual source files
 *   published/{slug}/index.html                       — rendered static site
 *
 * Every AI revision is committed; commits are immutable and can be listed,
 * inspected, and checked out (revert) at any time.
 */

export type SiteFiles = Record<string, string>;

export type CommitManifest = {
  sha: string;
  parent: string | null;
  message: string;
  model: string;
  authorId: string;
  createdAt: string;
  files: Array<{ path: string; key: string }>;
};

export type CommitSummary = {
  sha: string;
  parent: string | null;
  message: string;
  model: string;
  createdAt: string;
  fileCount: number;
};

const PAGE_PATH = "src/app/page.tsx";

function commitPrefix(websiteId: string, sha: string): string {
  return `websites/${websiteId}/commits/${sha}`;
}

function shaForFiles(websiteId: string, files: SiteFiles): string {
  const hash = createHash("sha1");
  hash.update(websiteId);
  hash.update(randomBytes(8));
  for (const path of Object.keys(files).sort()) {
    hash.update(path);
    hash.update(files[path]!);
  }
  return hash.digest("hex").slice(0, 12);
}

/** Commit a full snapshot of files to S3. Returns the new commit manifest. */
export async function commitWebsiteVersion(options: {
  websiteId: string;
  files: SiteFiles;
  message: string;
  model: string;
  authorId: string;
  parent: string | null;
}): Promise<CommitManifest> {
  const { websiteId, files, message, model, authorId, parent } = options;
  const sha = shaForFiles(websiteId, files);
  const prefix = commitPrefix(websiteId, sha);

  const uploaded: CommitManifest["files"] = [];
  for (const path of Object.keys(files).sort()) {
    const key = `${prefix}/${path}`;
    await uploadFileToS3Key(Buffer.from(files[path]!, "utf8"), key);
    uploaded.push({ path, key });
  }

  const manifest: CommitManifest = {
    sha,
    parent,
    message: message.slice(0, 500),
    model,
    authorId,
    createdAt: new Date().toISOString(),
    files: uploaded,
  };
  await uploadFileToS3Key(Buffer.from(JSON.stringify(manifest, null, 2), "utf8"), `${prefix}/manifest.json`);
  return manifest;
}

/** List every commit for a website, newest first. */
export async function listWebsiteCommits(websiteId: string): Promise<CommitSummary[]> {
  const keys = await listS3KeysWithPrefix(`websites/${websiteId}/commits/`);
  const shas = new Set<string>();
  for (const key of keys) {
    const match = key.match(/^websites\/[^/]+\/commits\/([0-9a-f]+)\/manifest\.json$/);
    if (match) shas.add(match[1]!);
  }

  const commits: CommitSummary[] = [];
  for (const sha of shas) {
    const manifest = await getCommitManifest(websiteId, sha);
    if (manifest) {
      commits.push({
        sha: manifest.sha,
        parent: manifest.parent,
        message: manifest.message,
        model: manifest.model,
        createdAt: manifest.createdAt,
        fileCount: manifest.files.length,
      });
    }
  }
  commits.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return commits;
}

export async function getCommitManifest(websiteId: string, sha: string): Promise<CommitManifest | null> {
  if (!/^[0-9a-f]{6,40}$/.test(sha)) return null;
  try {
    const raw = await downloadFileFromS3(`${commitPrefix(websiteId, sha)}/manifest.json`);
    const manifest = JSON.parse(raw.toString("utf8")) as CommitManifest;
    return manifest.sha === sha ? manifest : null;
  } catch {
    return null;
  }
}

/** Fetch every file in a commit, keyed by path. */
export async function getCommitFiles(websiteId: string, sha: string): Promise<SiteFiles> {
  const manifest = await getCommitManifest(websiteId, sha);
  if (!manifest) return {};
  const files: SiteFiles = {};
  for (const file of manifest.files) {
    try {
      const raw = await downloadFileFromS3(file.key);
      files[file.path] = raw.toString("utf8");
    } catch {
      // Missing object — skip
    }
  }
  return files;
}

/** Fetch just the main page component of a commit. */
export async function getCommitPage(websiteId: string, sha: string): Promise<string | null> {
  try {
    const raw = await downloadFileFromS3(`${commitPrefix(websiteId, sha)}/${PAGE_PATH}`);
    return raw.toString("utf8");
  } catch {
    return null;
  }
}

/* ------------------------------ Rendering ---------------------------------- */

let transpiler: Bun.Transpiler | null = null;

function getTranspiler(): Bun.Transpiler {
  if (!transpiler) {
    transpiler = new Bun.Transpiler({
      loader: "tsx",
      define: { "process.env.NODE_ENV": '"production"' },
    });
  }
  return transpiler;
}

/**
 * Render a generated page component (TSX string) to static HTML.
 * The generated code is transpiled with Bun and evaluated in an isolated
 * module; the `jsx` helpers it references are shimmed onto React.createElement.
 */
export async function renderPageComponent(code: string): Promise<string> {
  const js = getTranspiler().transformSync(code);
  const ids = [...new Set(js.match(/(?:jsx|jsxs|jsxDEV|Fragment)_[A-Za-z0-9_]+/g) ?? [])];
  const prelude =
    "const React = globalThis.React;\n" +
    ids
      .map((id) =>
        id.startsWith("Fragment_")
          ? `const ${id} = React.Fragment;`
          : `const ${id} = (type, props, key) => key === undefined ? React.createElement(type, props) : React.createElement(type, props, key);`,
      )
      .join("\n");

  const dataUrl = `data:text/javascript;base64,${Buffer.from(prelude + js).toString("base64")}`;
  const mod = (await import(dataUrl)) as { default?: unknown };
  const Component = mod.default;
  if (typeof Component !== "function") {
    throw new Error("The page component did not export a default React component.");
  }

  const element = React.createElement(Component as () => ReactElement);
  const markup = renderToStaticMarkup(element);
  return markup;
}

const TAILWIND_CDN = "https://cdn.tailwindcss.com";

/** Wrap rendered markup in a full HTML document styled with Tailwind. */
export function wrapSiteHtml(markup: string, title: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title.replace(/[<>&"]/g, "")}</title>
    <script src="${TAILWIND_CDN}"></script>
  </head>
  <body>
    <div id="root">${markup}</div>
  </body>
</html>`;
}

/** Render a full preview/published document from page source. */
export async function renderSiteDocument(pageCode: string, title: string): Promise<string> {
  const markup = await renderPageComponent(pageCode);
  return wrapSiteHtml(markup, title);
}

export { PAGE_PATH as SITE_PAGE_PATH };
