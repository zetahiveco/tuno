import { PrismaClient } from "@/tasks/generated/client/client";
import { createPostgresAdapter } from "@/lib/postgres";

const adapter = createPostgresAdapter("tasks");

export const prisma = new PrismaClient({ adapter });
