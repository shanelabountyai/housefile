-- CreateTable
CREATE TABLE "PairMemory" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "aId" UUID NOT NULL,
    "bId" UUID NOT NULL,
    "agreed" TEXT[],
    "reviewDecisionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PairMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PairMemory_orgId_aId_bId_key" ON "PairMemory"("orgId", "aId", "bId");

-- AddForeignKey
ALTER TABLE "PairMemory" ADD CONSTRAINT "PairMemory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairMemory" ADD CONSTRAINT "PairMemory_reviewDecisionId_fkey" FOREIGN KEY ("reviewDecisionId") REFERENCES "ReviewDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
