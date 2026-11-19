-- SkillModule: the curriculum for a skill. One row per section, ordered by
-- "position", the way a course page lists what it covers.
--
-- Deliberately NOT taken verbatim from `migrate diff`. That diff also emits
-- `DROP INDEX "Skill_embedding_idx"`, because the HNSW index sits on a column
-- Prisma models as Unsupported() and therefore cannot see. Dropping it turns
-- every semantic search into a full table scan, and it has already been lost
-- once this way (see 20261118130000_restore_embedding_index). The drop is
-- removed here on purpose.

-- CreateTable
CREATE TABLE "SkillModule" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "SkillModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SkillModule_skillId_position_idx" ON "SkillModule"("skillId", "position");

-- AddForeignKey
ALTER TABLE "SkillModule" ADD CONSTRAINT "SkillModule_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
