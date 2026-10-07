import { PrismaClient } from "@/notes/generated/client/client";
import { createPostgresAdapter } from "@/lib/postgres";

const adapter = createPostgresAdapter("notes");

export const prisma = new PrismaClient({ adapter });
