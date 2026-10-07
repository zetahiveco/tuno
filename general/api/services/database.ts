import { PrismaClient } from "@/general/generated/client/client";
import { createPostgresAdapter } from "@/lib/postgres";

const adapter = createPostgresAdapter("general");

export const prisma = new PrismaClient({ adapter });
