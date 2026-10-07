import { prisma } from "@/general/api/services/database";

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: bun scripts/reset-password.ts <email> <new-password>");
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
if (!user) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

const passwordHash = await Bun.password.hash(password, { algorithm: "argon2id" });
await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
// Invalidate all existing sessions for this user
await prisma.session.deleteMany({ where: { userId: user.id } });

console.log(`Password updated for ${user.email} (${user.id}). All sessions revoked.`);
process.exit(0);
