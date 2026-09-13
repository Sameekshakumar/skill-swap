-- Semantic search over skill descriptions.
CREATE EXTENSION IF NOT EXISTS vector;

-- 384 columns wide: the width of the all-MiniLM-L6-v2 model in lib/embeddings.js.
-- Nullable, because a skill exists before its embedding is generated.
ALTER TABLE "Skill" ADD COLUMN "embedding" vector(384);

-- Cosine distance, matching the normalised vectors the model produces.
CREATE INDEX "Skill_embedding_idx" ON "Skill" USING hnsw ("embedding" vector_cosine_ops);
