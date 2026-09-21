-- CreateTable
CREATE TABLE "PupitreLeader" (
    "id" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "pupitreId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PupitreLeader_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PupitreLeader_pupitreId_idx" ON "PupitreLeader"("pupitreId");

-- CreateIndex
CREATE UNIQUE INDEX "PupitreLeader_membershipId_pupitreId_key" ON "PupitreLeader"("membershipId", "pupitreId");

-- AddForeignKey
ALTER TABLE "PupitreLeader" ADD CONSTRAINT "PupitreLeader_membershipId_bandId_fkey" FOREIGN KEY ("membershipId", "bandId") REFERENCES "Membership"("id", "bandId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PupitreLeader" ADD CONSTRAINT "PupitreLeader_pupitreId_bandId_fkey" FOREIGN KEY ("pupitreId", "bandId") REFERENCES "Pupitre"("id", "bandId") ON DELETE CASCADE ON UPDATE CASCADE;

