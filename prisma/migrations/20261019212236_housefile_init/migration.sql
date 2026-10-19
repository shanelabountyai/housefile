-- CreateEnum
CREATE TYPE "ConstituentKind" AS ENUM ('PERSON');

-- CreateEnum
CREATE TYPE "ConstituentStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "GiftStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "ImportBatchEventKind" AS ENUM ('COMMITTED', 'UNDONE', 'UNDO_FAILED');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('MERGE', 'KEEP_SEPARATE', 'SAME_HOUSEHOLD', 'DEFER');

-- CreateEnum
CREATE TYPE "MergeKind" AS ENUM ('ROW_INTO_CONSTITUENT', 'CONSTITUENT_INTO_CONSTITUENT');

-- CreateTable
CREATE TABLE "Constituent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "ConstituentKind" NOT NULL DEFAULT 'PERSON',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Constituent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstituentVersion" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "constituentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ConstituentStatus" NOT NULL DEFAULT 'ACTIVE',
    "firstName" TEXT NOT NULL DEFAULT '',
    "middleName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "zip" TEXT NOT NULL DEFAULT '',
    "dob" DATE,
    "fieldMeta" JSONB NOT NULL DEFAULT '{}',
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "alternates" JSONB NOT NULL DEFAULT '[]',
    "householdId" UUID,
    "importBatchId" UUID,
    "mergeEventId" UUID,
    "reviewDecisionId" UUID,
    "userId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstituentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fund" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gift" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "giftRef" TEXT NOT NULL,
    "constituentId" UUID NOT NULL,
    "giftDate" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "fundId" UUID NOT NULL,
    "appealId" UUID,
    "giftType" TEXT NOT NULL DEFAULT 'GIFT',
    "externalRef" TEXT NOT NULL DEFAULT '',
    "supersedesGiftId" UUID,
    "status" "GiftStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "importBatchId" UUID,
    "mergeEventId" UUID,
    "reviewDecisionId" UUID,
    "userId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftCredit" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "giftRef" TEXT NOT NULL,
    "constituentId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "rawBytes" BYTEA NOT NULL,
    "contentHash" TEXT NOT NULL,
    "encoding" TEXT NOT NULL,
    "asOf" DATE NOT NULL,
    "map" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "plan" JSONB NOT NULL,
    "planHash" TEXT NOT NULL,
    "beforeHash" TEXT NOT NULL,
    "userId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatchEvent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "importBatchId" UUID NOT NULL,
    "kind" "ImportBatchEventKind" NOT NULL,
    "expectedHash" TEXT,
    "actualHash" TEXT,
    "userId" UUID,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "importBatchId" UUID NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "constituentId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,
    "flags" TEXT[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "reviewItemId" UUID NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "reason" TEXT,
    "userId" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MergeEvent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "kind" "MergeKind" NOT NULL,
    "survivorId" UUID NOT NULL,
    "loserId" UUID,
    "rowIndex" INTEGER,
    "survivorSnapshot" JSONB NOT NULL,
    "loserSnapshot" JSONB NOT NULL,
    "choices" JSONB NOT NULL,
    "giftRefsMoved" TEXT[],
    "softCreditsMoved" TEXT[],
    "reason" TEXT,
    "importBatchId" UUID,
    "reviewDecisionId" UUID,
    "userId" UUID,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MergeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Constituent_orgId_businessId_key" ON "Constituent"("orgId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Household_orgId_businessId_key" ON "Household"("orgId", "businessId");

-- CreateIndex
CREATE INDEX "ConstituentVersion_orgId_idx" ON "ConstituentVersion"("orgId");

-- CreateIndex
CREATE INDEX "ConstituentVersion_importBatchId_idx" ON "ConstituentVersion"("importBatchId");

-- CreateIndex
CREATE INDEX "ConstituentVersion_mergeEventId_idx" ON "ConstituentVersion"("mergeEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ConstituentVersion_constituentId_version_key" ON "ConstituentVersion"("constituentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Fund_orgId_code_key" ON "Fund"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_orgId_code_key" ON "Campaign"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Appeal_orgId_name_key" ON "Appeal"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Gift_supersedesGiftId_key" ON "Gift"("supersedesGiftId");

-- CreateIndex
CREATE INDEX "Gift_orgId_giftRef_idx" ON "Gift"("orgId", "giftRef");

-- CreateIndex
CREATE INDEX "Gift_constituentId_idx" ON "Gift"("constituentId");

-- CreateIndex
CREATE INDEX "Gift_importBatchId_idx" ON "Gift"("importBatchId");

-- CreateIndex
CREATE INDEX "SoftCredit_orgId_giftRef_idx" ON "SoftCredit"("orgId", "giftRef");

-- CreateIndex
CREATE INDEX "ImportBatch_orgId_createdAt_idx" ON "ImportBatch"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatchEvent_importBatchId_at_idx" ON "ImportBatchEvent"("importBatchId", "at");

-- CreateIndex
CREATE INDEX "ReviewItem_importBatchId_idx" ON "ReviewItem"("importBatchId");

-- CreateIndex
CREATE INDEX "ReviewDecision_reviewItemId_at_idx" ON "ReviewDecision"("reviewItemId", "at");

-- CreateIndex
CREATE INDEX "MergeEvent_orgId_at_idx" ON "MergeEvent"("orgId", "at");

-- CreateIndex
CREATE INDEX "MergeEvent_survivorId_idx" ON "MergeEvent"("survivorId");

-- CreateIndex
CREATE INDEX "MergeEvent_loserId_idx" ON "MergeEvent"("loserId");

-- AddForeignKey
ALTER TABLE "Constituent" ADD CONSTRAINT "Constituent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstituentVersion" ADD CONSTRAINT "ConstituentVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstituentVersion" ADD CONSTRAINT "ConstituentVersion_constituentId_fkey" FOREIGN KEY ("constituentId") REFERENCES "Constituent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstituentVersion" ADD CONSTRAINT "ConstituentVersion_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstituentVersion" ADD CONSTRAINT "ConstituentVersion_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstituentVersion" ADD CONSTRAINT "ConstituentVersion_mergeEventId_fkey" FOREIGN KEY ("mergeEventId") REFERENCES "MergeEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstituentVersion" ADD CONSTRAINT "ConstituentVersion_reviewDecisionId_fkey" FOREIGN KEY ("reviewDecisionId") REFERENCES "ReviewDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_constituentId_fkey" FOREIGN KEY ("constituentId") REFERENCES "Constituent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_supersedesGiftId_fkey" FOREIGN KEY ("supersedesGiftId") REFERENCES "Gift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_mergeEventId_fkey" FOREIGN KEY ("mergeEventId") REFERENCES "MergeEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_reviewDecisionId_fkey" FOREIGN KEY ("reviewDecisionId") REFERENCES "ReviewDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoftCredit" ADD CONSTRAINT "SoftCredit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoftCredit" ADD CONSTRAINT "SoftCredit_constituentId_fkey" FOREIGN KEY ("constituentId") REFERENCES "Constituent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatchEvent" ADD CONSTRAINT "ImportBatchEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatchEvent" ADD CONSTRAINT "ImportBatchEvent_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_constituentId_fkey" FOREIGN KEY ("constituentId") REFERENCES "Constituent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "ReviewItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeEvent" ADD CONSTRAINT "MergeEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeEvent" ADD CONSTRAINT "MergeEvent_survivorId_fkey" FOREIGN KEY ("survivorId") REFERENCES "Constituent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeEvent" ADD CONSTRAINT "MergeEvent_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "Constituent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeEvent" ADD CONSTRAINT "MergeEvent_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeEvent" ADD CONSTRAINT "MergeEvent_reviewDecisionId_fkey" FOREIGN KEY ("reviewDecisionId") REFERENCES "ReviewDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written below (task 2.1). Not expressible in the Prisma schema, so `migrate diff` ignores it.

-- D-6, D-46, D-47: six append-only tables. Pattern ported from the foundation's AuditEvent_append_only
-- (20260923100000). TRUNCATE is left alone (row triggers do not fire on it), so tests can empty the tables.
CREATE FUNCTION housefile_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "ConstituentVersion_append_only" BEFORE UPDATE OR DELETE ON "ConstituentVersion" FOR EACH ROW EXECUTE FUNCTION housefile_append_only();
CREATE TRIGGER "Gift_append_only" BEFORE UPDATE OR DELETE ON "Gift" FOR EACH ROW EXECUTE FUNCTION housefile_append_only();
CREATE TRIGGER "ImportBatch_append_only" BEFORE UPDATE OR DELETE ON "ImportBatch" FOR EACH ROW EXECUTE FUNCTION housefile_append_only();
CREATE TRIGGER "ImportBatchEvent_append_only" BEFORE UPDATE OR DELETE ON "ImportBatchEvent" FOR EACH ROW EXECUTE FUNCTION housefile_append_only();
CREATE TRIGGER "ReviewDecision_append_only" BEFORE UPDATE OR DELETE ON "ReviewDecision" FOR EACH ROW EXECUTE FUNCTION housefile_append_only();
CREATE TRIGGER "MergeEvent_append_only" BEFORE UPDATE OR DELETE ON "MergeEvent" FOR EACH ROW EXECUTE FUNCTION housefile_append_only();

-- D-7: every version has exactly one writer. Gifts and merges likewise (D-52).
ALTER TABLE "ConstituentVersion" ADD CONSTRAINT "ConstituentVersion_one_writer"
  CHECK (num_nonnulls("importBatchId", "mergeEventId", "reviewDecisionId", "userId") = 1);
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_one_writer"
  CHECK (num_nonnulls("importBatchId", "mergeEventId", "reviewDecisionId", "userId") = 1);
ALTER TABLE "MergeEvent" ADD CONSTRAINT "MergeEvent_one_writer"
  CHECK (num_nonnulls("importBatchId", "reviewDecisionId", "userId") = 1);

-- D-6: integer cents, positive; a superseding row says why.
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_supersede_reason"
  CHECK ("supersedesGiftId" IS NULL OR length(btrim(coalesce("reason", ''))) > 0);

-- D-22: MERGE and KEEP_SEPARATE need a reason.
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_reason"
  CHECK ("action" NOT IN ('MERGE', 'KEEP_SEPARATE') OR length(btrim(coalesce("reason", ''))) > 0);

-- D-46: a row merge has an import row and no loser constituent; a constituent merge the reverse.
ALTER TABLE "MergeEvent" ADD CONSTRAINT "MergeEvent_kind_shape"
  CHECK (("kind" = 'ROW_INTO_CONSTITUENT') = ("loserId" IS NULL AND "rowIndex" IS NOT NULL));
