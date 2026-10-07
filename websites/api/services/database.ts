import { PrismaClient } from "@/websites/generated/client/client";
import { createPostgresAdapter } from "@/lib/postgres";

const adapter = createPostgresAdapter("websites");

export const prisma = new PrismaClient({ adapter });
