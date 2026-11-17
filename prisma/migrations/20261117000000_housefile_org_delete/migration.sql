-- D-104 (2026-11-17): an org holding housefile data can be deleted, and nothing else changes.
-- Hand-written (the sandbox could not run the schema engine); the Prisma schema says the same thing:
-- `onDelete: Cascade` on every relation to Org, `onDelete: NoAction` on every relation between housefile tables.
--
-- 1. Every housefile table's orgId FK becomes ON DELETE CASCADE (was RESTRICT, D-52(a)).
-- 2. Every FK between housefile tables becomes ON DELETE NO ACTION (was RESTRICT or SET NULL). NO ACTION is checked at
--    the end of the statement, so the org's cascade can remove a constituent and the gifts that point at it in either
--    order; a direct DELETE of a referenced row is still refused, as RESTRICT refused it. SET NULL is gone because it
--    would rewrite append-only rows (and break the one-writer CHECKs) mid-cascade.
-- 3. housefile_append_only() lets a row change only when its org no longer exists, which is true only inside that
--    org's own cascade. While the org exists every UPDATE and DELETE is refused exactly as before (D-6, D-46, D-47).

-- 1. orgId -> Org: CASCADE
ALTER TABLE "Constituent" DROP CONSTRAINT "Constituent_orgId_fkey", ADD CONSTRAINT "Constituent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "Household" DROP CONSTRAINT "Household_orgId_fkey", ADD CONSTRAINT "Household_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "ConstituentVersion" DROP CONSTRAINT "ConstituentVersion_orgId_fkey", ADD CONSTRAINT "ConstituentVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "Fund" DROP CONSTRAINT "Fund_orgId_fkey", ADD CONSTRAINT "Fund_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_orgId_fkey", ADD CONSTRAINT "Campaign_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "Appeal" DROP CONSTRAINT "Appeal_orgId_fkey", ADD CONSTRAINT "Appeal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "Gift" DROP CONSTRAINT "Gift_orgId_fkey", ADD CONSTRAINT "Gift_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "SoftCredit" DROP CONSTRAINT "SoftCredit_orgId_fkey", ADD CONSTRAINT "SoftCredit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "ImportBatch" DROP CONSTRAINT "ImportBatch_orgId_fkey", ADD CONSTRAINT "ImportBatch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "ImportBatchEvent" DROP CONSTRAINT "ImportBatchEvent_orgId_fkey", ADD CONSTRAINT "ImportBatchEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "ReviewItem" DROP CONSTRAINT "ReviewItem_orgId_fkey", ADD CONSTRAINT "ReviewItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "ReviewDecision" DROP CONSTRAINT "ReviewDecision_orgId_fkey", ADD CONSTRAINT "ReviewDecision_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "MergeEvent" DROP CONSTRAINT "MergeEvent_orgId_fkey", ADD CONSTRAINT "MergeEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "PairMemory" DROP CONSTRAINT "PairMemory_orgId_fkey", ADD CONSTRAINT "PairMemory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "UnmergeEvent" DROP CONSTRAINT "UnmergeEvent_orgId_fkey", ADD CONSTRAINT "UnmergeEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "SegmentDefinition" DROP CONSTRAINT "SegmentDefinition_orgId_fkey", ADD CONSTRAINT "SegmentDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "SegmentRun" DROP CONSTRAINT "SegmentRun_orgId_fkey", ADD CONSTRAINT "SegmentRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "Pledge" DROP CONSTRAINT "Pledge_orgId_fkey", ADD CONSTRAINT "Pledge_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "Letter" DROP CONSTRAINT "Letter_orgId_fkey", ADD CONSTRAINT "Letter_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- 2. between housefile tables: NO ACTION
ALTER TABLE "ConstituentVersion" DROP CONSTRAINT "ConstituentVersion_constituentId_fkey", ADD CONSTRAINT "ConstituentVersion_constituentId_fkey" FOREIGN KEY ("constituentId") REFERENCES "Constituent"(id) ON UPDATE CASCADE;
ALTER TABLE "ConstituentVersion" DROP CONSTRAINT "ConstituentVersion_householdId_fkey", ADD CONSTRAINT "ConstituentVersion_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"(id) ON UPDATE CASCADE;
ALTER TABLE "ConstituentVersion" DROP CONSTRAINT "ConstituentVersion_importBatchId_fkey", ADD CONSTRAINT "ConstituentVersion_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"(id) ON UPDATE CASCADE;
ALTER TABLE "ConstituentVersion" DROP CONSTRAINT "ConstituentVersion_mergeEventId_fkey", ADD CONSTRAINT "ConstituentVersion_mergeEventId_fkey" FOREIGN KEY ("mergeEventId") REFERENCES "MergeEvent"(id) ON UPDATE CASCADE;
ALTER TABLE "ConstituentVersion" DROP CONSTRAINT "ConstituentVersion_reviewDecisionId_fkey", ADD CONSTRAINT "ConstituentVersion_reviewDecisionId_fkey" FOREIGN KEY ("reviewDecisionId") REFERENCES "ReviewDecision"(id) ON UPDATE CASCADE;
ALTER TABLE "Appeal" DROP CONSTRAINT "Appeal_campaignId_fkey", ADD CONSTRAINT "Appeal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"(id) ON UPDATE CASCADE;
ALTER TABLE "Gift" DROP CONSTRAINT "Gift_appealId_fkey", ADD CONSTRAINT "Gift_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal"(id) ON UPDATE CASCADE;
ALTER TABLE "Gift" DROP CONSTRAINT "Gift_constituentId_fkey", ADD CONSTRAINT "Gift_constituentId_fkey" FOREIGN KEY ("constituentId") REFERENCES "Constituent"(id) ON UPDATE CASCADE;
ALTER TABLE "Gift" DROP CONSTRAINT "Gift_fundId_fkey", ADD CONSTRAINT "Gift_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"(id) ON UPDATE CASCADE;
ALTER TABLE "Gift" DROP CONSTRAINT "Gift_importBatchId_fkey", ADD CONSTRAINT "Gift_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"(id) ON UPDATE CASCADE;
ALTER TABLE "Gift" DROP CONSTRAINT "Gift_mergeEventId_fkey", ADD CONSTRAINT "Gift_mergeEventId_fkey" FOREIGN KEY ("mergeEventId") REFERENCES "MergeEvent"(id) ON UPDATE CASCADE;
ALTER TABLE "Gift" DROP CONSTRAINT "Gift_reviewDecisionId_fkey", ADD CONSTRAINT "Gift_reviewDecisionId_fkey" FOREIGN KEY ("reviewDecisionId") REFERENCES "ReviewDecision"(id) ON UPDATE CASCADE;
ALTER TABLE "Gift" DROP CONSTRAINT "Gift_supersedesGiftId_fkey", ADD CONSTRAINT "Gift_supersedesGiftId_fkey" FOREIGN KEY ("supersedesGiftId") REFERENCES "Gift"(id) ON UPDATE CASCADE;
ALTER TABLE "SoftCredit" DROP CONSTRAINT "SoftCredit_constituentId_fkey", ADD CONSTRAINT "SoftCredit_constituentId_fkey" FOREIGN KEY ("constituentId") REFERENCES "Constituent"(id) ON UPDATE CASCADE;
ALTER TABLE "SoftCredit" DROP CONSTRAINT "SoftCredit_mergeEventId_fkey", ADD CONSTRAINT "SoftCredit_mergeEventId_fkey" FOREIGN KEY ("mergeEventId") REFERENCES "MergeEvent"(id) ON UPDATE CASCADE;
ALTER TABLE "SoftCredit" DROP CONSTRAINT "SoftCredit_supersedesSoftCreditId_fkey", ADD CONSTRAINT "SoftCredit_supersedesSoftCreditId_fkey" FOREIGN KEY ("supersedesSoftCreditId") REFERENCES "SoftCredit"(id) ON UPDATE CASCADE;
ALTER TABLE "ImportBatchEvent" DROP CONSTRAINT "ImportBatchEvent_importBatchId_fkey", ADD CONSTRAINT "ImportBatchEvent_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"(id) ON UPDATE CASCADE;
ALTER TABLE "ReviewItem" DROP CONSTRAINT "ReviewItem_constituentId_fkey", ADD CONSTRAINT "ReviewItem_constituentId_fkey" FOREIGN KEY ("constituentId") REFERENCES "Constituent"(id) ON UPDATE CASCADE;
ALTER TABLE "ReviewItem" DROP CONSTRAINT "ReviewItem_importBatchId_fkey", ADD CONSTRAINT "ReviewItem_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"(id) ON UPDATE CASCADE;
ALTER TABLE "ReviewDecision" DROP CONSTRAINT "ReviewDecision_reviewItemId_fkey", ADD CONSTRAINT "ReviewDecision_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "ReviewItem"(id) ON UPDATE CASCADE;
ALTER TABLE "MergeEvent" DROP CONSTRAINT "MergeEvent_importBatchId_fkey", ADD CONSTRAINT "MergeEvent_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"(id) ON UPDATE CASCADE;
ALTER TABLE "MergeEvent" DROP CONSTRAINT "MergeEvent_loserId_fkey", ADD CONSTRAINT "MergeEvent_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "Constituent"(id) ON UPDATE CASCADE;
ALTER TABLE "MergeEvent" DROP CONSTRAINT "MergeEvent_reviewDecisionId_fkey", ADD CONSTRAINT "MergeEvent_reviewDecisionId_fkey" FOREIGN KEY ("reviewDecisionId") REFERENCES "ReviewDecision"(id) ON UPDATE CASCADE;
ALTER TABLE "MergeEvent" DROP CONSTRAINT "MergeEvent_survivorId_fkey", ADD CONSTRAINT "MergeEvent_survivorId_fkey" FOREIGN KEY ("survivorId") REFERENCES "Constituent"(id) ON UPDATE CASCADE;
ALTER TABLE "PairMemory" DROP CONSTRAINT "PairMemory_reviewDecisionId_fkey", ADD CONSTRAINT "PairMemory_reviewDecisionId_fkey" FOREIGN KEY ("reviewDecisionId") REFERENCES "ReviewDecision"(id) ON UPDATE CASCADE;
ALTER TABLE "UnmergeEvent" DROP CONSTRAINT "UnmergeEvent_mergeEventId_fkey", ADD CONSTRAINT "UnmergeEvent_mergeEventId_fkey" FOREIGN KEY ("mergeEventId") REFERENCES "MergeEvent"(id) ON UPDATE CASCADE;
ALTER TABLE "SegmentRun" DROP CONSTRAINT "SegmentRun_definitionId_fkey", ADD CONSTRAINT "SegmentRun_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "SegmentDefinition"(id) ON UPDATE CASCADE;
ALTER TABLE "Pledge" DROP CONSTRAINT "Pledge_appealId_fkey", ADD CONSTRAINT "Pledge_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "Appeal"(id) ON UPDATE CASCADE;
ALTER TABLE "Pledge" DROP CONSTRAINT "Pledge_constituentId_fkey", ADD CONSTRAINT "Pledge_constituentId_fkey" FOREIGN KEY ("constituentId") REFERENCES "Constituent"(id) ON UPDATE CASCADE;
ALTER TABLE "Pledge" DROP CONSTRAINT "Pledge_fundId_fkey", ADD CONSTRAINT "Pledge_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"(id) ON UPDATE CASCADE;
ALTER TABLE "Pledge" DROP CONSTRAINT "Pledge_mergeEventId_fkey", ADD CONSTRAINT "Pledge_mergeEventId_fkey" FOREIGN KEY ("mergeEventId") REFERENCES "MergeEvent"(id) ON UPDATE CASCADE;
ALTER TABLE "Pledge" DROP CONSTRAINT "Pledge_supersedesPledgeId_fkey", ADD CONSTRAINT "Pledge_supersedesPledgeId_fkey" FOREIGN KEY ("supersedesPledgeId") REFERENCES "Pledge"(id) ON UPDATE CASCADE;
ALTER TABLE "Letter" DROP CONSTRAINT "Letter_constituentId_fkey", ADD CONSTRAINT "Letter_constituentId_fkey" FOREIGN KEY ("constituentId") REFERENCES "Constituent"(id) ON UPDATE CASCADE;
ALTER TABLE "Letter" DROP CONSTRAINT "Letter_householdId_fkey", ADD CONSTRAINT "Letter_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"(id) ON UPDATE CASCADE;

-- 3. append-only, except inside the org's own deletion
CREATE OR REPLACE FUNCTION housefile_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Org" WHERE id = OLD."orgId") THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;
