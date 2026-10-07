import { PrismaClient } from "@/forms/generated/client/client";
import { createPostgresAdapter } from "@/lib/postgres";

const adapter = createPostgresAdapter("forms");

export const prisma = new PrismaClient({ adapter });