-- DropForeignKey
ALTER TABLE "ReviewItem" DROP CONSTRAINT "ReviewItem_constituentId_fkey";

-- AlterTable
ALTER TABLE "ReviewItem" ADD COLUMN     "candidateRowIndex" INTEGER,
ALTER COLUMN "constituentId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_constituentId_fkey" FOREIGN KEY ("constituentId") REFERENCES "Constituent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written (task 2.4, D-55): a review item's candidate is a constituent or an earlier row still in review, never both.
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_one_candidate"
  CHECK (num_nonnulls("constituentId", "candidateRowIndex") = 1);
