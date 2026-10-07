/**
 * One-off migration: CRM Leads → Accounts with pipeline stages.
 *
 * - Creates crm."PipelineStage" and seeds default stages (Lead, Contacted, Deal, Closed, Lost) per user.
 * - Creates crm."Account" and copies every Lead into it, mapping the old status to a stage.
 * - Contacts now belong to an account: accountId is backfilled from the old leadId.
 * - Tasks and notes are relinked from leadId to accountId.
 * - Custom field values recorded against LEAD are re-pointed to ACCOUNT.
 *
 * Rows that cannot satisfy the new rules (e.g. a contact with no lead) are dropped.
 * Run before `bun run db:push`. Safe to run once; the script is idempotent-ish by
 * checking whether crm."Account" already exists.
 */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

const sql = new Bun.SQL(databaseUrl);

try {
  const existing = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'crm' AND table_name = 'Account'
  `;
  if (existing.length > 0) {
    console.log("crm.Account already exists — skipping migration.");
    process.exit(0);
  }

  await sql.begin(async (tx) => {
    // 1. Pipeline stages table.
    await tx.unsafe(`
      CREATE TABLE "crm"."PipelineStage" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "color" TEXT NOT NULL DEFAULT '#755984',
        "position" INTEGER NOT NULL DEFAULT 0,
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
      );
    `);
    await tx.unsafe(`CREATE INDEX "PipelineStage_createdById_idx" ON "crm"."PipelineStage"("createdById");`);

    // 2. Seed default stages for every user that has leads.
    await tx.unsafe(`
      INSERT INTO "crm"."PipelineStage" ("id", "name", "color", "position", "createdById")
      SELECT
        gen_random_uuid()::text,
        stage.name,
        stage.color,
        stage.position,
        owners."createdById"
      FROM (SELECT DISTINCT "createdById" FROM "crm"."Lead") AS owners
      CROSS JOIN (VALUES
        ('Lead', '#8c838f', 0),
        ('Contacted', '#3b63a8', 1),
        ('Deal', '#b98a2f', 2),
        ('Closed', '#4e8a68', 3),
        ('Lost', '#b05f5f', 4)
      ) AS stage(name, color, position);
    `);

    // 3. Accounts table, copied from leads with the same ids.
    await tx.unsafe(`
      CREATE TABLE "crm"."Account" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL DEFAULT '',
        "phone" TEXT NOT NULL DEFAULT '',
        "source" TEXT NOT NULL DEFAULT '',
        "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "stageId" TEXT NOT NULL,
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
      );
    `);
    await tx.unsafe(`CREATE INDEX "Account_createdById_idx" ON "crm"."Account"("createdById");`);
    await tx.unsafe(`CREATE INDEX "Account_stageId_idx" ON "crm"."Account"("stageId");`);
    await tx.unsafe(`CREATE INDEX "Account_updatedAt_idx" ON "crm"."Account"("updatedAt");`);

    await tx.unsafe(`
      INSERT INTO "crm"."Account" ("id", "name", "email", "phone", "source", "value", "stageId", "createdById", "createdAt", "updatedAt")
      SELECT
        lead."id",
        lead."name",
        lead."email",
        lead."phone",
        lead."source",
        lead."value",
        stage."id",
        lead."createdById",
        lead."createdAt",
        lead."updatedAt"
      FROM "crm"."Lead" AS lead
      JOIN "crm"."PipelineStage" AS stage
        ON stage."createdById" = lead."createdById"
       AND stage."name" = CASE lead."status"::text
         WHEN 'NEW' THEN 'Lead'
         WHEN 'CONTACTED' THEN 'Contacted'
         WHEN 'QUALIFIED' THEN 'Deal'
         WHEN 'PROPOSAL' THEN 'Deal'
         WHEN 'WON' THEN 'Closed'
         WHEN 'LOST' THEN 'Lost'
         ELSE 'Lead'
       END;
    `);

    await tx.unsafe(`
      ALTER TABLE "crm"."Account"
      ADD CONSTRAINT "Account_stageId_fkey"
      FOREIGN KEY ("stageId") REFERENCES "crm"."PipelineStage"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT;
    `);

    // 4. Contacts: accountId is now required. Drop contacts without a lead.
    await tx.unsafe(`ALTER TABLE "crm"."Contact" ADD COLUMN "accountId" TEXT;`);
    await tx.unsafe(`UPDATE "crm"."Contact" SET "accountId" = "leadId" WHERE "leadId" IS NOT NULL;`);
    await tx.unsafe(`DELETE FROM "crm"."Contact" WHERE "accountId" IS NULL;`);
    await tx.unsafe(`ALTER TABLE "crm"."Contact" ALTER COLUMN "accountId" SET NOT NULL;`);
    await tx.unsafe(`ALTER TABLE "crm"."Contact" DROP COLUMN "leadId";`);
    await tx.unsafe(`ALTER TABLE "crm"."Contact" DROP COLUMN "company";`);
    await tx.unsafe(`CREATE INDEX "Contact_accountId_idx" ON "crm"."Contact"("accountId");`);
    await tx.unsafe(`
      ALTER TABLE "crm"."Contact"
      ADD CONSTRAINT "Contact_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES "crm"."Account"("id")
      ON UPDATE CASCADE ON DELETE CASCADE;
    `);

    // 5. Tasks and notes: relink to accounts.
    for (const table of ["CrmTask", "CrmNote"]) {
      await tx.unsafe(`ALTER TABLE "crm"."${table}" ADD COLUMN "accountId" TEXT;`);
      await tx.unsafe(`UPDATE "crm"."${table}" SET "accountId" = "leadId" WHERE "leadId" IS NOT NULL;`);
      await tx.unsafe(`ALTER TABLE "crm"."${table}" DROP COLUMN "leadId";`);
      await tx.unsafe(`CREATE INDEX "${table}_accountId_idx" ON "crm"."${table}"("accountId");`);
      await tx.unsafe(`
        ALTER TABLE "crm"."${table}"
        ADD CONSTRAINT "${table}_accountId_fkey"
        FOREIGN KEY ("accountId") REFERENCES "crm"."Account"("id")
        ON UPDATE CASCADE ON DELETE CASCADE;
      `);
    }

    // 6. Custom field values recorded against leads now target accounts.
    await tx.unsafe(`UPDATE "crm"."CustomFieldValue" SET "entityType" = 'ACCOUNT' WHERE "entityType" = 'LEAD';`);

    console.log("CRM leads → accounts migration complete.");
  });
} finally {
  await sql.end();
}
