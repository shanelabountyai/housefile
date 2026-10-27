-- CreateEnum
CREATE TYPE "SoftCreditStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- AlterTable
ALTER TABLE "SoftCredit" ADD COLUMN     "amountCents" INTEGER NOT NULL,
ADD COLUMN     "mergeEventId" UUID,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "role" TEXT NOT NULL,
ADD COLUMN     "softCreditRef" TEXT NOT NULL,
ADD COLUMN     "status" "SoftCreditStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "supersedesSoftCreditId" UUID,
ADD COLUMN     "userId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "SoftCredit_supersedesSoftCreditId_key" ON "SoftCredit"("supersedesSoftCreditId");

-- CreateIndex
CREATE INDEX "SoftCredit_orgId_softCreditRef_idx" ON "SoftCredit"("orgId", "softCreditRef");

-- CreateIndex
CREATE INDEX "SoftCredit_constituentId_idx" ON "SoftCredit"("constituentId");

-- AddForeignKey
ALTER TABLE "SoftCredit" ADD CONSTRAINT "SoftCredit_supersedesSoftCreditId_fkey" FOREIGN KEY ("supersedesSoftCreditId") REFERENCES "SoftCredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoftCredit" ADD CONSTRAINT "SoftCredit_mergeEventId_fkey" FOREIGN KEY ("mergeEventId") REFERENCES "MergeEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Hand-written (task 3.7, D-9, D-74c, D-81): soft credits are append-only, chained like pledges; one writer; positive
-- cents; a superseding row says why. The table was never written before this migration (Phase 2 left it a seam).
CREATE TRIGGER "SoftCredit_append_only" BEFORE UPDATE OR DELETE ON "SoftCredit" FOR EACH ROW EXECUTE FUNCTION housefile_append_only();
ALTER TABLE "SoftCredit" ADD CONSTRAINT "SoftCredit_one_writer" CHECK (num_nonnulls("mergeEventId", "userId") = 1);
ALTER TABLE "SoftCredit" ADD CONSTRAINT "SoftCredit_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "SoftCredit" ADD CONSTRAINT "SoftCredit_supersede_reason"
  CHECK ("supersedesSoftCreditId" IS NULL OR length(btrim(coalesce("reason", ''))) > 0);
