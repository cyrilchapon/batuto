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
    "pupitreBandId" TEXT NOT NULL,
    "tier" "MemberInstrumentTier" NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validatedById" TEXT,
    "validatorBandId" TEXT,
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
ALTER TABLE "MemberInstrument" ADD CONSTRAINT "MemberInstrument_pupitreId_pupitreBandId_fkey" FOREIGN KEY ("pupitreId", "pupitreBandId") REFERENCES "Pupitre"("id", "bandId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberInstrument" ADD CONSTRAINT "MemberInstrument_validatedById_validatorBandId_fkey" FOREIGN KEY ("validatedById", "validatorBandId") REFERENCES "Membership"("id", "bandId") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddCheckConstraint
-- Band scoping is carried by one denormalised band column per composite
-- foreign key, because Prisma cannot write a relation scalar shared by two
-- relations (it leaves it NULL) and cannot SET NULL a column that another,
-- non-nullable relation also uses. These two checks are what tie those
-- columns back together; they are hand-written, invisible to `migrate diff`,
-- and must be carried forward by hand if this table is ever rebuilt.
ALTER TABLE "MemberInstrument"
    ADD CONSTRAINT "MemberInstrument_pupitreBandId_matches_bandId"
    CHECK ("pupitreBandId" = "bandId");

ALTER TABLE "MemberInstrument"
    ADD CONSTRAINT "MemberInstrument_validatorBandId_matches_bandId"
    CHECK ("validatorBandId" IS NULL OR "validatorBandId" = "bandId");
