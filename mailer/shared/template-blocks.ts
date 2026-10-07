// Isomorphic template rendering for the Mailer app.
//
// Template content is a BlockNote document (a JSON array of blocks, exactly
// what the BlockNote editor produces and consumes — see
// mailer/frontend/email-blocknote.tsx for the editor schema, which adds the
// custom "button" and "spacer" blocks).
//
// Everything in this file is pure string manipulation so it can run in the
// browser (live preview in the editor) and on the server (rendering at send
// time) without pulling in the BlockNote packages.

/* --------------------------------- Types --------------------------------- */

export type InterpolationValues = Record<string, string>;

export type EmailTextStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  textColor?: string;
  backgroundColor?: string;
};

export type EmailInlineContent =
  | { type: "text"; text: string; styles?: EmailTextStyle }
  | { type: "link"; href: string; content: EmailInlineContent[] };

export type EmailBlock = {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: EmailInlineContent[];
  children?: EmailBlock[];
};

/* --------------------------- Legacy template blocks -------------------------- */

type LegacyTemplateBlock =
  | { id: string; type: "heading"; text: string; level: 1 | 2 | 3 }
  | { id: string; type: "text"; text: string }
  | { id: string; type: "button"; text: string; url: string }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer"; height: number };

const LEGACY_TYPES = new Set(["heading", "text", "button", "divider", "spacer"]);

function isLegacyBlocks(parsed: unknown): parsed is LegacyTemplateBlock[] {
  if (!Array.isArray(parsed)) return false;
  // Legacy blocks have no BlockNote keys (props/content/children) on any entry.
  return (
    parsed.length > 0 &&
    parsed.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        LEGACY_TYPES.has((entry as LegacyTemplateBlock).type) &&
        !("props" in entry) &&
        !("content" in entry) &&
        !("children" in entry),
    )
  );
}

// Minimal inline-markdown → BlockNote content runs, used when migrating the
// legacy markdown-based templates: **bold**, *italic*, _italic_, `code`, [label](url).
function markdownToInlineContent(text: string): EmailInlineContent[] {
  const runs: EmailInlineContent[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) runs.push({ type: "text", text: text.slice(cursor, start), styles: {} });
    cursor = start + match[0].length;
    if (match[1]) runs.push({ type: "text", text: match[1].slice(1, -1), styles: { code: true } });
    else if (match[2]) runs.push({ type: "text", text: match[2].slice(2, -2), styles: { bold: true } });
    else if (match[3]) runs.push({ type: "text", text: match[3].slice(1, -1), styles: { italic: true } });
    else if (match[4]) runs.push({ type: "text", text: match[4].slice(1, -1), styles: { italic: true } });
    else if (match[5]) runs.push({ type: "link", href: match[7]!, content: [{ type: "text", text: match[6]!, styles: {} }] });
  }
  if (cursor < text.length) runs.push({ type: "text", text: text.slice(cursor), styles: {} });
  return runs.length ? runs : [{ type: "text", text: "", styles: {} }];
}

function legacyBlockToEmailBlocks(block: LegacyTemplateBlock): EmailBlock[] {
  switch (block.type) {
    case "heading":
      return [{ type: "heading", props: { level: block.level }, content: markdownToInlineContent(block.text), children: [] }];
    case "text": {
      const out: EmailBlock[] = [];
      for (const line of block.text.replaceAll("\r\n", "\n").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^[-*+]\s+/.test(trimmed)) out.push({ type: "bulletListItem", props: {}, content: markdownToInlineContent(trimmed.replace(/^[-*+]\s+/, "")), children: [] });
        else if (/^\d+[.)]\s+/.test(trimmed)) out.push({ type: "numberedListItem", props: {}, content: markdownToInlineContent(trimmed.replace(/^\d+[.)]\s+/, "")), children: [] });
        else if (/^>\s?/.test(trimmed)) out.push({ type: "quote", props: {}, content: markdownToInlineContent(trimmed.replace(/^>\s?/, "")), children: [] });
        else if (/^(---+|\*\*\*+)$/.test(trimmed)) out.push({ type: "divider", props: {}, children: [] });
        else out.push({ type: "paragraph", props: {}, content: markdownToInlineContent(trimmed), children: [] });
      }
      return out.length ? out : [{ type: "paragraph", props: {}, content: markdownToInlineContent(block.text), children: [] }];
    }
    case "button":
      return [{ type: "button", props: { url: block.url }, content: [{ type: "text", text: block.text, styles: {} }], children: [] }];
    case "divider":
      return [{ type: "divider", props: {}, children: [] }];
    case "spacer":
      return [{ type: "spacer", props: { height: block.height }, children: [] }];
  }
}

/* --------------------------------- Parsing --------------------------------- */

export function parseTemplateBlocks(content: string): EmailBlock[] {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      if (isLegacyBlocks(parsed)) return parsed.flatMap(legacyBlockToEmailBlocks);
      return parsed.filter(
        (block): block is EmailBlock =>
          !!block && typeof block === "object" && typeof (block as EmailBlock).type === "string",
      );
    }
  } catch {
    // Fall through to an empty document.
  }
  return [];
}

export function defaultTemplateBlocks(): EmailBlock[] {
  return [
    {
      type: "heading",
      props: { level: 1 },
      content: [{ type: "text", text: "Hi {{ name }},", styles: {} }],
      children: [],
    },
    {
      type: "paragraph",
      props: {},
      content: [
        { type: "text", text: "Write your message here — use the toolbar for bold, italic, lists and links.", styles: {} },
      ],
      children: [],
    },
    {
      type: "paragraph",
      props: {},
      content: [
        { type: "text", text: "Personalize with variables like ", styles: {} },
        { type: "link", href: "https://example.com", content: [{ type: "text", text: "{{ email }}", styles: {} }] },
        { type: "text", text: " or {{ name }}, and any custom properties from your audience — e.g. {{ plan }}.", styles: {} },
      ],
      children: [],
    },
  ];
}

/* ------------------------------- Interpolation ------------------------------ */

const VARIABLE_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function extractVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) found.add(match[1]!);
  return [...found];
}

export function interpolate(input: string, values: InterpolationValues): string {
  return input.replace(VARIABLE_PATTERN, (_match, key: string) => values[key] ?? "");
}

/* --------------------------------- Helpers --------------------------------- */

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

// BlockNote color names → email-safe hex values.
const COLOR_MAP: Record<string, string> = {
  default: "",
  gray: "#6b7280",
  brown: "#8a5a44",
  red: "#c0392b",
  orange: "#d9730d",
  yellow: "#b8860b",
  green: "#2e7d32",
  blue: "#1d6fb8",
  purple: "#7a4fa3",
  pink: "#c2417c",
};

function colorValue(value: string | undefined): string {
  if (!value || value === "default") return "";
  return COLOR_MAP[value] ?? value;
}

function propString(block: EmailBlock, key: string, fallback = ""): string {
  const value = block.props?.[key];
  return typeof value === "string" ? value : fallback;
}

function propNumber(block: EmailBlock, key: string, fallback: number): number {
  const value = block.props?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function blockAlignment(block: EmailBlock): string {
  const alignment = propString(block, "textAlignment", "left");
  return alignment === "center" || alignment === "right" ? `text-align:${alignment};` : "";
}

/* ------------------------------ Inline content ------------------------------ */

function renderStyledText(text: string, styles: EmailTextStyle | undefined, values: InterpolationValues): string {
  let html = escapeHtml(interpolate(text, values));
  if (!html) return "";
  if (styles?.code) {
    html = `<code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.9em;background:#f4f2f6;padding:1px 5px;border-radius:4px;">${html}</code>`;
  }
  if (styles?.bold) html = `<strong>${html}</strong>`;
  if (styles?.italic) html = `<em>${html}</em>`;
  if (styles?.underline) html = `<u>${html}</u>`;
  if (styles?.strike) html = `<s>${html}</s>`;
  const textColor = colorValue(styles?.textColor);
  const backgroundColor = colorValue(styles?.backgroundColor);
  if (textColor || backgroundColor) {
    html = `<span style="${textColor ? `color:${textColor};` : ""}${backgroundColor ? `background:${backgroundColor};` : ""}">${html}</span>`;
  }
  return html;
}

function renderInlineContent(content: EmailInlineContent[] | undefined, values: InterpolationValues): string {
  if (!Array.isArray(content)) return "";
  let html = "";
  for (const item of content) {
    if (item.type === "link") {
      const href = interpolate(item.href ?? "", values).trim();
      const inner = renderInlineContent(item.content, values);
      html += href
        ? `<a href="${escapeHtml(href)}" style="color:#7a4fa3;text-decoration:underline;">${inner}</a>`
        : inner;
    } else if (item.type === "text") {
      html += renderStyledText(item.text ?? "", item.styles, values);
    }
  }
  return html;
}

function blockPlainText(block: EmailBlock, values: InterpolationValues): string {
  if (!Array.isArray(block.content)) return "";
  return block.content
    .map((item) => {
      if (item.type === "text") return interpolate(item.text ?? "", values);
      if (item.type === "link") return (item.content ?? []).map((inner) => (inner.type === "text" ? interpolate(inner.text ?? "", values) : "")).join("");
      return "";
    })
    .join("");
}

/* ------------------------------- Block HTML ------------------------------- */

const ACCENT = "#7a4fa3";
const PARAGRAPH_STYLE = "margin:0 0 16px;";
const HEADING_SIZES: Record<number, string> = { 1: "26px", 2: "21px", 3: "17px", 4: "15px", 5: "14px", 6: "13px" };

function renderBlockHtml(block: EmailBlock, values: InterpolationValues): string {
  switch (block.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, propNumber(block, "level", 1)));
      const size = HEADING_SIZES[level] ?? "15px";
      const inner = renderInlineContent(block.content, values) || "<br />";
      return `<h${level} style="margin:0 0 16px;font-size:${size};line-height:1.3;font-weight:600;color:#211d26;${blockAlignment(block)}">${inner}</h${level}>`;
    }
    case "paragraph": {
      const inner = renderInlineContent(block.content, values) || "<br />";
      return `<p style="${PARAGRAPH_STYLE}${blockAlignment(block)}">${inner}</p>`;
    }
    case "quote":
      return `<blockquote style="margin:0 0 16px;padding:10px 16px;border-left:3px solid #e3dcec;color:#5f5568;">${renderInlineContent(block.content, values)}</blockquote>`;
    case "checkListItem": {
      const checked = block.props?.checked === true;
      return `<li style="list-style:none;margin-bottom:4px;">${checked ? "☑" : "☐"} ${renderInlineContent(block.content, values)}</li>`;
    }
    case "bulletListItem":
    case "toggleListItem":
      return `<li style="margin-bottom:4px;">${renderInlineContent(block.content, values)}${renderChildrenHtml(block, values)}</li>`;
    case "numberedListItem":
      return `<li style="margin-bottom:4px;">${renderInlineContent(block.content, values)}${renderChildrenHtml(block, values)}</li>`;
    case "divider":
      return '<hr style="border:none;border-top:1px solid #e8e4ee;margin:24px 0;" />';
    case "button": {
      const label = blockPlainText(block, values) || "Open";
      const rawUrl = interpolate(propString(block, "url"), values).trim();
      if (!rawUrl) return "";
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="border-radius:8px;background:${ACCENT};"><a href="${escapeHtml(rawUrl)}" style="display:inline-block;padding:11px 22px;border-radius:8px;background:${ACCENT};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
    }
    case "spacer":
      return `<div style="height:${Math.max(4, Math.min(200, propNumber(block, "height", 24)))}px;line-height:0;font-size:0;">&nbsp;</div>`;
    case "image": {
      const url = interpolate(propString(block, "url"), values).trim();
      if (!url) return "";
      const caption = propString(block, "caption");
      return `<img src="${escapeHtml(url)}" alt="${escapeHtml(interpolate(caption, values))}" style="max-width:100%;height:auto;margin:0 0 16px;border-radius:8px;" />`;
    }
    case "codeBlock": {
      const code = blockPlainText(block, values);
      return `<pre style="margin:0 0 16px;padding:12px 14px;background:#f6f4f8;border-radius:8px;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.6;">${escapeHtml(code)}</pre>`;
    }
    default:
      return "";
  }
}

// Lists: consecutive list items of the same kind are grouped; nested children
// render inside the item.
function renderChildrenHtml(block: EmailBlock, values: InterpolationValues): string {
  const children = block.children ?? [];
  return children.length ? `<div style="padding-left:20px;">${renderBlockListHtml(children, values)}</div>` : "";
}

function renderBlockListHtml(blocks: EmailBlock[], values: InterpolationValues): string {
  const out: string[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index]!;
    const listType =
      block.type === "bulletListItem" || block.type === "toggleListItem"
        ? "ul"
        : block.type === "numberedListItem"
          ? "ol"
          : block.type === "checkListItem"
            ? "check"
            : null;
    if (!listType) {
      out.push(renderBlockHtml(block, values));
      index += 1;
      continue;
    }
    const items: EmailBlock[] = [];
    while (index < blocks.length) {
      const next = blocks[index]!;
      const nextType =
        next.type === "bulletListItem" || next.type === "toggleListItem"
          ? "ul"
          : next.type === "numberedListItem"
            ? "ol"
            : next.type === "checkListItem"
              ? "check"
              : null;
      if (nextType !== listType) break;
      items.push(next);
      index += 1;
    }
    if (listType === "check") {
      out.push(`<ul style="margin:0 0 16px;padding-left:24px;list-style:none;">${items.map((item) => renderBlockHtml(item, values)).join("")}</ul>`);
    } else {
      const style = "margin:0 0 16px;padding-left:24px;";
      out.push(`<${listType} style="${style}">${items.map((item) => renderBlockHtml(item, values)).join("")}</${listType}>`);
    }
  }
  return out.join("\n");
}

/* ------------------------------ Email HTML ------------------------------ */

export function renderBlocksHtml(blocks: EmailBlock[], values: InterpolationValues): string {
  return renderBlockListHtml(blocks, values);
}

export type RenderEmailOptions = {
  blocks: EmailBlock[];
  values: InterpolationValues;
  /** Rewrite links through the click tracker and add the open pixel. */
  tracking?: { clickUrlBase: string; openUrl: string };
  /** Footer text (supports {{ variables }}). Falls back to a sensible default. */
  footerText?: string;
  /** Per-recipient unsubscribe link; renders an "Unsubscribe" footer link when set. */
  unsubscribeUrl?: string;
};

export const DEFAULT_FOOTER_TEXT = "You're receiving this email because you're part of this workspace's audience.";

/** URL excluded from click-tracking so unsubscribe clicks go straight through. */
function isExcludedFromTracking(url: string, options: RenderEmailOptions): boolean {
  return Boolean(options.unsubscribeUrl) && url === options.unsubscribeUrl;
}

export function renderEmailHtml({ blocks, values, tracking, footerText, unsubscribeUrl }: RenderEmailOptions): string {
  let body = renderBlocksHtml(blocks, values);

  if (tracking) {
    body = body.replace(/href="(https?:\/\/[^"]+)"/g, (match, url: string) => {
      if (isExcludedFromTracking(url, { blocks, values, tracking, footerText, unsubscribeUrl })) return match;
      if (url.startsWith(tracking.clickUrlBase)) return match;
      return `href="${tracking.clickUrlBase}?u=${encodeURIComponent(url)}"`;
    });
    body += `<img src="${tracking.openUrl}" width="1" height="1" alt="" style="display:none;" />`;
  }

  const footer = escapeHtml(interpolate(footerText?.trim() ? footerText : DEFAULT_FOOTER_TEXT, values)).replaceAll("\n", "<br />");
  const unsubscribeHtml = unsubscribeUrl
    ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#a49ba9;text-decoration:underline;">Unsubscribe</a>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1eef4;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(interpolate("{{ email }}", values))}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1eef4;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #e8e4ee;border-radius:12px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#3a3440;font-size:15px;line-height:1.6;">
            <tr><td>${body}</td></tr>
            <tr>
              <td style="padding-top:24px;border-top:1px solid #f0edf3;font-size:12px;color:#a49ba9;">
                ${footer}${unsubscribeHtml ? `<br />${unsubscribeHtml}` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Plain-text version for the `text` part of the email. */
export function renderBlocksText(blocks: EmailBlock[], values: InterpolationValues): string {
  const lines: string[] = [];

  function walk(list: EmailBlock[], indent: string) {
    for (const block of list) {
      const text = blockPlainText(block, values).trim();
      switch (block.type) {
        case "heading":
          if (text) lines.push(`${text}\n${"=".repeat(Math.min(40, Math.max(4, text.length)))}`);
          break;
        case "bulletListItem":
        case "toggleListItem":
          lines.push(`${indent}• ${text}`);
          break;
        case "checkListItem":
          lines.push(`${indent}${block.props?.checked === true ? "[x]" : "[ ]"} ${text}`);
          break;
        case "numberedListItem":
          lines.push(`${indent}- ${text}`);
          break;
        case "quote":
          lines.push(`${indent}> ${text}`);
          break;
        case "button": {
          const url = interpolate(propString(block, "url"), values).trim();
          if (url) lines.push(`${text || "Open"}: ${url}`);
          break;
        }
        case "divider":
          lines.push("----------------------------------------");
          break;
        case "image":
          if (propString(block, "url")) lines.push(propString(block, "url"));
          break;
        case "codeBlock":
          lines.push(blockPlainText(block, values));
          break;
        default:
          if (text) lines.push(text);
      }
      if (block.children?.length) walk(block.children, `${indent}  `);
    }
  }

  walk(blocks, "");
  return lines.filter(Boolean).join("\n\n");
}
