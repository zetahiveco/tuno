/**
 * Smoke test for the CRM, Tasks, and Documents APIs.
 * Creates a temp user + session directly in the DB and calls the running server.
 * Usage: bun scripts/smoke-new-apps.ts (server must be running on PORT)
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma as generalPrisma } from "@/general/api/services/database";

const BASE = `http://localhost:${process.env.PORT ?? 5000}`;

const token = randomBytes(24).toString("hex");
const tokenHash = createHash("sha256").update(token).digest("hex");
const suffix = randomBytes(4).toString("hex");

const user = await generalPrisma.user.create({
  data: {
    name: "Smoke Tester",
    email: `smoke-${suffix}@tuno.test`,
    passwordHash: "smoke",
    role: "ADMIN",
    sessions: { create: { tokenHash, expiresAt: new Date(Date.now() + 3_600_000) } },
  },
});

const otherUser = await generalPrisma.user.create({
  data: {
    name: "Teammate",
    email: `smoke-mate-${suffix}@tuno.test`,
    passwordHash: "smoke",
  },
});

let failures = 0;
async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      cookie: `tuno_session=${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const isJson = response.headers.get("content-type")?.includes("json");
  const payload = isJson ? await response.json() : null;
  return { status: response.status, payload };
}

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`✔ ${label}`);
  } else {
    failures += 1;
    console.error(`✘ ${label}`, detail ?? "");
  }
}

/* ----------------------------------- CRM ----------------------------------- */

const { payload: stages } = await call("GET", "/api/crm/stages");
check("CRM: default stages seeded", stages?.stages?.length === 5 && stages.stages[0]?.name === "Lead", stages);

const { payload: customStage } = await call("POST", "/api/crm/stages", { name: "Negotiation" });
check("CRM: add custom stage", customStage?.stage?.id, customStage);

let { payload: crm } = await call("POST", "/api/crm/accounts", { name: "Acme Corp", value: 5000, stageId: customStage.stage.id });
check("CRM: create account in custom stage", crm?.account?.id && crm.account.stage?.name === "Negotiation", crm);

const { payload: field } = await call("POST", "/api/crm/fields", { name: "Region", type: "SELECT", options: ["EU", "US"], appliesTo: "ACCOUNT" });
check("CRM: create custom field", field?.field?.id, field);

const { payload: valued } = await call("PUT", "/api/crm/values", { entityType: "ACCOUNT", entityId: crm.account.id, values: { [field.field.id]: "EU" } });
check("CRM: set custom value", valued?.customValues?.[field.field.id] === "EU", valued);

const { payload: accounts } = await call("GET", "/api/crm/accounts");
check("CRM: account list carries custom values", accounts?.accounts?.[0]?.customValues?.[field.field.id] === "EU", accounts);

const noAccount = await call("POST", "/api/crm/contacts", { name: "Jane Doe" });
check("CRM: contact requires an account", noAccount.status === 400, noAccount);

let contact = await call("POST", "/api/crm/contacts", { name: "Jane Doe", accountId: crm.account.id });
check("CRM: create contact linked to account", contact.payload?.contact?.accountId === crm.account.id, contact);

let crmTask = await call("POST", "/api/crm/tasks", { title: "Send proposal", status: "TODO" });
check("CRM: create task", crmTask.payload?.task?.id, crmTask);

const crmNote = await call("POST", "/api/crm/notes", { body: "Intro call went well", accountId: crm.account.id });
check("CRM: create note", crmNote.payload?.note?.id, crmNote);

const lostStage = stages.stages.find((stage) => stage.name === "Lost");
const moved = await call("PATCH", `/api/crm/accounts/${crm.account.id}`, { stageId: lostStage.id });
check("CRM: move account to another stage (kanban)", moved.payload?.account?.stageId === lostStage.id, moved);

const stageDelete = await call("DELETE", `/api/crm/stages/${lostStage.id}`);
check("CRM: cannot delete a stage holding accounts", stageDelete.status === 409, stageDelete);

/* ---------------------------------- Tasks ----------------------------------- */

let board = await call("POST", "/api/tasks/boards", { name: "Launch plan" });
check("Tasks: create board", board.payload?.board?.id, board);

const boardDetail = await call("GET", `/api/tasks/boards/${board.payload.board.id}`);
check("Tasks: board has default columns", boardDetail.payload?.board?.columns?.length === 3, boardDetail.payload?.board?.columns);
check("Tasks: owner role", boardDetail.payload?.board?.role === "owner");

const column = boardDetail.payload.board.columns[0];
const card = await call("POST", `/api/tasks/boards/${board.payload.board.id}/cards`, { columnId: column.id, title: "Write spec" });
check("Tasks: create card", card.payload?.card?.id, card);

const subtask = await call("POST", `/api/tasks/boards/${board.payload.board.id}/cards`, { columnId: column.id, title: "Outline", parentId: card.payload.card.id });
check("Tasks: create subtask", subtask.payload?.card?.parentId === card.payload.card.id, subtask);

const share = await call("POST", `/api/tasks/boards/${board.payload.board.id}/shares`, { userId: otherUser.id });
check("Tasks: share board with teammate", share.status === 201, share);

const assign = await call("PATCH", `/api/tasks/cards/${card.payload.card.id}`, { assigneeId: otherUser.id, dueDate: new Date().toISOString() });
check("Tasks: assign card to shared user", assign.payload?.card?.assigneeId === otherUser.id, assign);

const planner = await call("GET", "/api/tasks/planner");
check("Tasks: planner returns scheduled card", planner.payload?.cards?.length === 1, planner.payload);

const publicSlug = await call("POST", `/api/tasks/boards/${board.payload.board.id}/shares/public`);
check("Tasks: public link created", Boolean(publicSlug.payload?.sharing?.publicSlug), publicSlug);

const publicBoard = await fetch(`${BASE}/api/public/tasks/boards/${publicSlug.payload.sharing.publicSlug}`);
const publicData = await publicBoard.json();
check("Tasks: public board is readable anonymously", publicData?.board?.cards?.length === 1, publicData);
check("Tasks: public board hides nothing needed", publicData.board.cards[0].subtasks.length === 1);

// Non-owner teammate can edit cards but not rename the board.
const teammateToken = randomBytes(24).toString("hex");
await generalPrisma.session.create({
  data: { tokenHash: createHash("sha256").update(teammateToken).digest("hex"), userId: otherUser.id, expiresAt: new Date(Date.now() + 3_600_000) },
});
const teammateMove = await fetch(`${BASE}/api/tasks/cards/${card.payload.card.id}`, {
  method: "PATCH",
  headers: { cookie: `tuno_session=${teammateToken}`, "content-type": "application/json" },
  body: JSON.stringify({ title: "Write spec v2" }),
});
check("Tasks: shared teammate can edit cards", teammateMove.ok);
const teammateRename = await fetch(`${BASE}/api/tasks/boards/${board.payload.board.id}`, {
  method: "PATCH",
  headers: { cookie: `tuno_session=${teammateToken}`, "content-type": "application/json" },
  body: JSON.stringify({ name: "Hacked" }),
});
check("Tasks: shared teammate cannot rename board", teammateRename.status === 404, teammateRename.status);

/* --------------------------------- Documents -------------------------------- */

const folder = await call("POST", "/api/documents/folders", { name: "Contracts" });
check("Documents: create folder", folder.payload?.folder?.id, folder);

const nested = await call("POST", "/api/documents/folders", { name: "2026", parentId: folder.payload.folder.id });
check("Documents: create nested folder", nested.payload?.folder?.parentId === folder.payload.folder.id, nested);

// S3 is likely not configured locally — the endpoint should fail gracefully with a clear error.
const upload = await call("POST", "/api/documents/uploads", { name: "hello.txt" });
check("Documents: presigned upload responds (or graceful storage error)", upload.status === 201 || upload.status === 500, upload);

if (upload.status === 201) {
  const put = await fetch(upload.payload.upload.url, { method: "PUT", body: "hello world" });
  check("Documents: upload to storage", put.ok);
  const registered = await call("POST", "/api/documents/files", { folderId: folder.payload.folder.id, name: "hello.txt", key: upload.payload.upload.filename, size: 11, mimeType: "text/plain" });
  check("Documents: register file", registered.status === 201, registered);
  const list = await call("GET", `/api/documents/files?parentId=${folder.payload.folder.id}`);
  check("Documents: list files in folder", list.payload?.files?.length === 1, list.payload);
  const download = await call("GET", `/api/documents/files/${registered.payload.file.id}/download`);
  check("Documents: presigned download", download.status === 200 && Boolean(download.payload?.download?.url), download);

  const publicLink = await call("POST", `/api/documents/folders/${folder.payload.folder.id}/shares/public`);
  check("Documents: public link created", Boolean(publicLink.payload?.sharing?.publicSlug), publicLink);
  const publicFolder = await fetch(`${BASE}/api/public/documents/folders/${publicLink.payload.sharing.publicSlug}`);
  const publicData = await publicFolder.json();
  check("Documents: public folder readable anonymously", publicData?.folder?.files?.length === 1, publicData);
  const publicDownload = await fetch(`${BASE}/api/public/documents/files/${registered.payload.file.id}/download`);
  check("Documents: public download allowed", publicDownload.status === 200, publicDownload.status);
} else {
  check("Documents: storage error message is helpful", typeof upload.payload?.error === "string" && upload.payload.error.includes("AWS"), upload.payload);
}

/* --------------------------------- Cleanup ---------------------------------- */

await call("DELETE", `/api/crm/accounts/${crm.account.id}`);
await call("DELETE", `/api/tasks/boards/${board.payload.board.id}`);
await call("DELETE", `/api/documents/folders/${folder.payload.folder.id}`);
await generalPrisma.user.deleteMany({ where: { id: { in: [user.id, otherUser.id] } } });

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
