type AppName = "general" | "mailer" | "notes" | "forms" | "scheduler" | "crm" | "tasks" | "documents" | "cms";
type Operation = "generate" | "push";
type Command = Operation | "setup";

const apps: AppName[] = ["general", "mailer", "notes", "forms", "scheduler", "crm", "tasks", "documents", "cms"];
const operation = Bun.argv[2] as Command | undefined;

if (operation !== "generate" && operation !== "push" && operation !== "setup") {
  console.error("Usage: bun scripts/database.ts <generate|push|setup>");
  process.exit(1);
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe database identifier: ${name}`);
  }
  return `"${name}"`;
}

async function ensureDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName) {
    throw new Error("DATABASE_URL is missing a database name.");
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new Bun.SQL(adminUrl.toString());
  try {
    const existing = await admin`SELECT 1 FROM pg_database WHERE datname = ${databaseName}`;
    if (existing.length === 0) {
      await admin.unsafe(`CREATE DATABASE ${quoteIdent(databaseName)}`);
    }
  } finally {
    await admin.close();
  }

  const database = new Bun.SQL(databaseUrl);
  try {
    for (const schema of apps) {
      await database.unsafe(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
    }
  } finally {
    await database.close();
  }
}

async function run(action: Operation, app: AppName): Promise<void> {
  const args = action === "generate"
    ? ["generate", "--config", `${app}/prisma/prisma.config.ts`]
    : ["db", "push", "--config", `${app}/prisma/prisma.config.ts`];
  const child = Bun.spawn(["bunx", "--bun", "prisma", ...args], {
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`Prisma ${action} failed for ${app} (exit ${exitCode}).`);
  }
}

try {
  if (operation === "push" || operation === "setup") {
    await ensureDatabase();
  }

  const actions: Operation[] = operation === "setup" ? ["generate", "push"] : [operation];
  for (const action of actions) {
    for (const app of apps) {
      await run(action, app);
    }
  }
} catch (error) {
  console.error(error);
  process.exit(1);
}
