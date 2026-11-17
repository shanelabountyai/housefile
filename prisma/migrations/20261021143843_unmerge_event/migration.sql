-- CreateTable
CREATE TABLE "UnmergeEvent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "mergeEventId" UUID NOT NULL,
    "survivorHash" TEXT NOT NULL,
    "loserHash" TEXT NOT NULL,
    "reason" TEXT,
    "userId" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnmergeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnmergeEvent_mergeEventId_key" ON "UnmergeEvent"("mergeEventId");

-- AddForeignKey
ALTER TABLE "UnmergeEvent" ADD CONSTRAINT "UnmergeEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnmergeEvent" ADD CONSTRAINT "UnmergeEvent_mergeEventId_fkey" FOREIGN KEY ("mergeEventId") REFERENCES "MergeEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (task 2.7, D-62): an unmerge is a ledger row too.
CREATE TRIGGER "UnmergeEvent_append_only" BEFORE UPDATE OR DELETE ON "UnmergeEvent" FOR EACH ROW EXECUTE FUNCTION housefile_append_only();
