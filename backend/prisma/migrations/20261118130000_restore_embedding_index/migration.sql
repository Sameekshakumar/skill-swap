-- Restore the vector index on Skill.embedding.
--
-- 20260913132640_skill_embeddings created it, but it was not present in the
-- database when checked on 18 November 2026 — most likely lost when the
-- project was restored from a paused state. Without it, every semantic search
-- scans the whole table and compares 384 numbers per row.
--
-- IF NOT EXISTS so this is safe to re-run and on a database that still has it.
CREATE INDEX IF NOT EXISTS "Skill_embedding_idx"
  ON "Skill" USING hnsw ("embedding" vector_cosine_ops);
