import { PrismaClient } from "@/scheduler/generated/client/client";
import { createPostgresAdapter } from "@/lib/postgres";

const adapter = createPostgresAdapter("scheduler");

export const prisma = new PrismaClient({ adapter });
