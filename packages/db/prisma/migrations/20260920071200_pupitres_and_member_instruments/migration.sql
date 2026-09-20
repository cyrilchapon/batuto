-- CreateEnum
CREATE TYPE "MemberInstrumentTier" AS ENUM ('debutant', 'non_autonome', 'autonome', 'referent');

-- CreateTable
CREATE TABLE "Pupitre" (
    "id" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pupitre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberInstrument" (
    "id" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "pupitreId" TEXT NOT NULL,
    "tier" "MemberInstrumentTier" NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pupitre_bandId_name_key" ON "Pupitre"("bandId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Pupitre_id_bandId_key" ON "Pupitre"("id", "bandId");

-- CreateIndex
CREATE INDEX "MemberInstrument_pupitreId_idx" ON "MemberInstrument"("pupitreId");

-- CreateIndex
CREATE INDEX "MemberInstrument_validatedById_idx" ON "MemberInstrument"("validatedById");

-- CreateIndex
CREATE UNIQUE INDEX "MemberInstrument_membershipId_pupitreId_key" ON "MemberInstrument"("membershipId", "pupitreId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_id_bandId_key" ON "Membership"("id", "bandId");

-- AddForeignKey
ALTER TABLE "Pupitre" ADD CONSTRAINT "Pupitre_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberInstrument" ADD CONSTRAINT "MemberInstrument_membershipId_bandId_fkey" FOREIGN KEY ("membershipId", "bandId") REFERENCES "Membership"("id", "bandId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberInstrument" ADD CONSTRAINT "MemberInstrument_pupitreId_bandId_fkey" FOREIGN KEY ("pupitreId", "bandId") REFERENCES "Pupitre"("id", "bandId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Hand-edited, and it must stay hand-edited: Prisma emits a bare
-- `ON DELETE SET NULL`, which would try to null "bandId" too and fail against
-- its NOT NULL. Postgres 15+ takes a column list, so only the validator is
-- cleared when their membership goes — the instrument and its band survive.
-- Regenerating this migration would silently drop the column list; the
-- "keeps a validated instrument, minus its validator" case in
-- apps/api/src/db.test.ts is what catches that. Registered in
-- .agents/context/engineering/modules/database-migrations.md — keep the two
-- in step. This fixes the database-side cascade only: `disconnect` on that
-- relation still fails client-side (prisma/prisma#8403).
ALTER TABLE "MemberInstrument" ADD CONSTRAINT "MemberInstrument_validatedById_bandId_fkey" FOREIGN KEY ("validatedById", "bandId") REFERENCES "Membership"("id", "bandId") ON DELETE SET NULL ("validatedById") ON UPDATE CASCADE;

