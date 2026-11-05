-- AlterTable
ALTER TABLE "Gift" ADD COLUMN     "pledgeRef" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Pledge" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "pledgeRef" TEXT NOT NULL,
    "constituentId" UUID NOT NULL,
    "pledgeDate" DATE NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "schedule" JSONB NOT NULL,
    "fundId" UUID NOT NULL,
    "appealId" UUID,
    "supersedesPledgeId" UUID,
    "reason" TEXT,
    "mergeEventId" UUID,
    "userId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pledge_supersedesPledgeId_key" ON "Pledge"("supersedesPledgeId");

-- CreateIndex
CREATE INDEX "Pledge_orgId_pledgeRef_idx" ON "Pledge"("orgId", "pledgeRef");

-- CreateIndex
CREATE INDEX "Pledge_constituentId_idx" ON "Pledge"("constituentId");

-- AddForeignKey
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_constituentId_fkey" FOREIGN KEY ("constituentId") REFERENCES "Constituent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_supersedesPledgeId_fkey" FOREIGN KEY ("supersedesPledgeId") REFERENCES "Pledge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_mergeEventId_fkey" FOREIGN KEY ("mergeEventId") REFERENCES "MergeEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-written (task 3.6, D-9, D-71): pledges are append-only, chained like gifts; one writer; positive cents;
-- a superseding row says why.
CREATE TRIGGER "Pledge_append_only" BEFORE UPDATE OR DELETE ON "Pledge" FOR EACH ROW EXECUTE FUNCTION housefile_append_only();
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_one_writer" CHECK (num_nonnulls("mergeEventId", "userId") = 1);
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_total_positive" CHECK ("totalCents" > 0);
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_supersede_reason"
  CHECK ("supersedesPledgeId" IS NULL OR length(btrim(coalesce("reason", ''))) > 0);
