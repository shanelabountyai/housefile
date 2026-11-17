-- CreateEnum
CREATE TYPE "LetterStatus" AS ENUM ('QUEUED');

-- CreateTable
CREATE TABLE "Letter" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "letterRef" TEXT NOT NULL,
    "constituentId" UUID,
    "householdId" UUID,
    "giftRefs" TEXT[],
    "giftIds" UUID[],
    "totalCents" INTEGER NOT NULL,
    "asOf" DATE NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "LetterStatus" NOT NULL DEFAULT 'QUEUED',
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Letter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Letter_orgId_createdAt_idx" ON "Letter"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Letter_orgId_letterRef_key" ON "Letter"("orgId", "letterRef");

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_constituentId_fkey" FOREIGN KEY ("constituentId") REFERENCES "Constituent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Hand-written (task 3.8, D-26, D-66 / P-8, D-82): letters are append-only; QUEUED is the only status written and
-- LETTER_STALE is derived; one recipient (a constituent, or a household when combined); every covered giftRef names the
-- row it was rendered from; positive cents.
CREATE TRIGGER "Letter_append_only" BEFORE UPDATE OR DELETE ON "Letter" FOR EACH ROW EXECUTE FUNCTION housefile_append_only();
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_one_recipient" CHECK (num_nonnulls("constituentId", "householdId") = 1);
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_gifts_named" CHECK (cardinality("giftRefs") > 0 AND cardinality("giftRefs") = cardinality("giftIds"));
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_total_positive" CHECK ("totalCents" > 0);
