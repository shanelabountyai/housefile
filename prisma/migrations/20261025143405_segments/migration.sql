-- CreateTable
CREATE TABLE "SegmentDefinition" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentRun" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "asOf" DATE NOT NULL,
    "members" TEXT[],
    "count" INTEGER NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "memberListHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SegmentDefinition_orgId_key_version_key" ON "SegmentDefinition"("orgId", "key", "version");

-- CreateIndex
CREATE INDEX "SegmentRun_definitionId_at_idx" ON "SegmentRun"("definitionId", "at");

-- AddForeignKey
ALTER TABLE "SegmentDefinition" ADD CONSTRAINT "SegmentDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentRun" ADD CONSTRAINT "SegmentRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentRun" ADD CONSTRAINT "SegmentRun_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "SegmentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (task 3.4, D-76): definition versions and runs are append-only; a new version is a new row.
CREATE TRIGGER "SegmentDefinition_append_only" BEFORE UPDATE OR DELETE ON "SegmentDefinition" FOR EACH ROW EXECUTE FUNCTION housefile_append_only();
CREATE TRIGGER "SegmentRun_append_only" BEFORE UPDATE OR DELETE ON "SegmentRun" FOR EACH ROW EXECUTE FUNCTION housefile_append_only();
