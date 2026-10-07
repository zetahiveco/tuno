import { PrismaClient } from "@/documents/generated/client/client";
import { createPostgresAdapter } from "@/lib/postgres";

const adapter = createPostgresAdapter("documents");

export const prisma = new PrismaClient({ adapter });
