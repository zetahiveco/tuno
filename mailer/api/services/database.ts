import { PrismaClient } from "@/mailer/generated/client/client";
import { createPostgresAdapter } from "@/lib/postgres";

const adapter = createPostgresAdapter("mailer");

export const prisma = new PrismaClient({ adapter });
