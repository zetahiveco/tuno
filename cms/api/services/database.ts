import { PrismaClient } from "@/cms/generated/client/client";
import { createPostgresAdapter } from "@/lib/postgres";

const adapter = createPostgresAdapter("cms");

export const prisma = new PrismaClient({ adapter });
