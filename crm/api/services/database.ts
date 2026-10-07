import { PrismaClient } from "@/crm/generated/client/client";
import { createPostgresAdapter } from "@/lib/postgres";

const adapter = createPostgresAdapter("crm");

export const prisma = new PrismaClient({ adapter });
