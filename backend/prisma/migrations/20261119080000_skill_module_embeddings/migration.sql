-- Give each module its own embedding.
--
-- The first attempt folded module text into the parent skill's single vector.
-- That was measured and it made search worse: averaging a skill's description
-- together with every module dilutes it, and 6 of 9 test queries scored lower
-- than before modules existed ("learn to play songs" -> Guitar fell from 0.378
-- to 0.318). A phrase that appears in exactly one module, like "rule of
-- thirds", still lost to an unrelated skill.
--
-- One vector per module fixes that: the skill keeps its own undiluted vector,
-- each module is matched on its own, and a skill scores as the best of the two.
ALTER TABLE "SkillModule" ADD COLUMN "embedding" vector(384);

-- Same index type as Skill_embedding_idx — cosine distance, which is what
-- lib/skillSearch.js compares with.
CREATE INDEX IF NOT EXISTS "SkillModule_embedding_idx"
  ON "SkillModule" USING hnsw ("embedding" vector_cosine_ops);
