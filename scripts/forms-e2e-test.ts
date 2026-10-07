// Temporary e2e smoke test for the Forms app. Creates a short-lived session for
// the first user, exercises the API, then removes the session. Safe to delete.
import { createHash, randomBytes } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL not set");

const base = process.env.TEST_BASE ?? "http://localhost:8080";
const token = randomBytes(32).toString("hex");
const tokenHash = createHash("sha256").update(token).digest("hex");

const sql = new Bun.SQL(databaseUrl);
const cleanup = async () => {
  await sql`DELETE FROM general."Session" WHERE "tokenHash" = ${tokenHash}`;
  await sql.close();
};

const cookie = `tuno_session=${token}`;
let failures = 0;

function check(name: string, condition: boolean, extra = "") {
  if (condition) {
    console.log(`✓ ${name}`);
  } else {
    failures += 1;
    console.error(`✗ ${name} ${extra}`);
  }
}

async function call(path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { Cookie: cookie, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  let body: unknown = null;
  if (response.status !== 204) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }
  return { status: response.status, body } as { status: number; body: any };
}

const blocks = [
  { id: "b1", type: "paragraph", label: "Welcome! Answer a couple of quick questions.", description: "", required: false, options: [] },
  {
    id: "b2",
    type: "select",
    label: "Do you own a pet?",
    description: "",
    required: true,
    options: [
      { id: "o1", label: "Yes", skip: "next", jumpTarget: null },
      { id: "o2", label: "No", skip: "jump", jumpTarget: "b4" },
    ],
  },
  { id: "b3", type: "shortText", label: "What is your pet's name?", description: "", required: true, options: [] },
  { id: "b4", type: "file", label: "Upload a photo of your workspace", description: "", required: false, options: [] },
  { id: "b5", type: "multiSelect", label: "Which snacks do you like?", description: "", required: false, options: [
    { id: "o3", label: "Chips", skip: "next", jumpTarget: null },
    { id: "o4", label: "Chocolate", skip: "end", jumpTarget: null },
  ] },
];

try {
  // Create a session for an existing user.
  const users = await sql`SELECT id FROM general."User" ORDER BY "createdAt" LIMIT 1`;
  if (users.length === 0) throw new Error("No users in database");
  await sql`INSERT INTO general."Session" ("tokenHash", "userId", "expiresAt") VALUES (${tokenHash}, ${users[0].id}, ${new Date(Date.now() + 3600_000)})`;

  // 1. Create a form.
  const created = await call("/api/forms/forms", { method: "POST", body: JSON.stringify({ title: "E2E Test Form" }) });
  check("create form", created.status === 201 && !!created.body?.form?.id, `status ${created.status}`);
  const formId = created.body?.form?.id as string;

  // 2. Save blocks with skip logic.
  const patched = await call(`/api/forms/forms/${formId}`, { method: "PATCH", body: JSON.stringify({ blocks }) });
  check("save blocks with skip logic", patched.status === 200, `status ${patched.status}`);

  // 3. Publish before any questions → should fail with empty blocks; now has questions.
  const published = await call(`/api/forms/forms/${formId}/publish`, { method: "POST" });
  check("publish form", published.status === 200 && published.body?.status === "PUBLISHED", `status ${published.status} ${JSON.stringify(published.body)}`);
  const slug = published.body?.publicSlug as string;

  // 4. Fetch the published form publicly.
  const publicForm = await call(`/api/public/forms/${slug}`);
  check("public form fetch", publicForm.status === 200 && publicForm.body?.form?.blocks?.length === 5, `status ${publicForm.status}`);

  // 5. File upload presigning via lib/file.ts.
  const upload = await call("/api/public/forms/upload-url", { method: "POST", body: JSON.stringify({ filename: "workspace photo.png" }) });
  check("presigned upload url", upload.status === 200 && typeof upload.body?.url === "string" && upload.body.filename.includes("workspace_photo.png"), `status ${upload.status} ${JSON.stringify(upload.body)}`);
  const storedFilename = upload.body?.filename as string;

  // 6. Submit with skip logic: answer "No" at b2 → jumps to b4 (skips required b3!).
  const good = await call(`/api/public/forms/${slug}/submissions`, {
    method: "POST",
    body: JSON.stringify({ answers: { b2: "o2", b4: storedFilename } }),
  });
  check("submission with skip (No → jumps past required b3)", good.status === 201, `status ${good.status} ${JSON.stringify(good.body)}`);

  // 7. Submit answering "Yes" but missing required b3 → rejected.
  const bad = await call(`/api/public/forms/${slug}/submissions`, {
    method: "POST",
    body: JSON.stringify({ answers: { b2: "o1" } }),
  });
  check("missing required answer rejected", bad.status === 400, `status ${bad.status}`);

  // 8. Multi-select "Chocolate" ends the form early.
  const earlyEnd = await call(`/api/public/forms/${slug}/submissions`, {
    method: "POST",
    body: JSON.stringify({ answers: { b2: "o1", b3: "Rex", b5: ["o4"] } }),
  });
  check("multi-select end-logic submission", earlyEnd.status === 201, `status ${earlyEnd.status} ${JSON.stringify(earlyEnd.body)}`);

  // 9. List submissions as the owner.
  const subs = await call(`/api/forms/forms/${formId}/submissions`);
  check("owner submissions list", subs.status === 200 && subs.body?.submissions?.length === 2, `status ${subs.status}`);

  // 10. Owner can request a download link for the uploaded file.
  const fileUrl = await call(`/api/forms/files/${encodeURIComponent(storedFilename)}/url`);
  check("owner file download link", fileUrl.status === 200 && typeof fileUrl.body?.url === "string", `status ${fileUrl.status}`);

  // 11. Unpublish → public fetch now 404.
  await call(`/api/forms/forms/${formId}/publish`, { method: "DELETE" });
  const afterUnpublish = await call(`/api/public/forms/${slug}`);
  check("unpublished form hidden", afterUnpublish.status === 404, `status ${afterUnpublish.status}`);

  // 12. Clean up: delete the test form and its submissions.
  const removed = await call(`/api/forms/forms/${formId}`, { method: "DELETE" });
  check("delete test form", removed.status === 204, `status ${removed.status}`);
} catch (error) {
  failures += 1;
  console.error("Unexpected failure:", error);
} finally {
  await cleanup();
}

console.log(failures === 0 ? "\nAll e2e checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);