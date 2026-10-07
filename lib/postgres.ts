import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

export type AppSchema = "general" | "mailer" | "notes" | "forms" | "scheduler" | "crm" | "tasks" | "documents" | "cms";

export function createPostgresAdapter(schema: AppSchema) {
  return new PrismaPg(
    {
      connectionString,
      options: `-c search_path=${schema}`,
    },
    { schema },
  );
}
