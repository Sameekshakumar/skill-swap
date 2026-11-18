# Vector search: creation, CRUD and the feature it powers

The vector database is not a separate server — it is PostgreSQL with the
[`pgvector`](https://github.com/pgvector/pgvector) extension. `Skill.embedding`
holds a 384-dimension vector per skill, and search compares them by cosine
distance.

Code: `backend/lib/embeddings.js` (text → vector) and `backend/lib/skillSearch.js`
(the query). Backfill: `backend/backfill-embeddings.js`.

---

## What an embedding is

A model reads the skill's name and description and returns 384 numbers. Text
that *means* similar things produces similar numbers, so closeness in that
384-dimensional space stands in for similarity of meaning.

That is what lets "I want to learn an instrument" match a listing that says
"acoustic fingerstyle lessons" without sharing a single word.

The model is `Xenova/all-MiniLM-L6-v2`, running **locally** through
`@xenova/transformers`. It downloads once (~90 MB) into `node_modules` and is
cached there — no API key, no per-query cost, no network dependency afterwards.

## Creation (DDL)

From `20260913132640_skill_embeddings`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Skill" ADD COLUMN "embedding" vector(384);

CREATE INDEX "Skill_embedding_idx"
  ON "Skill" USING hnsw ("embedding" vector_cosine_ops);
```

Three decisions worth explaining:

- **`vector(384)`** — the width is fixed and must match the model. Changing model
  means changing the column, the constant in `lib/embeddings.js`, and re-running
  the backfill.
- **Nullable** — a skill exists before its embedding does. New skills are
  embedded in the background after saving, so a slow model never makes adding a
  skill fail. Search scores an un-embedded row 0 rather than dropping it.
- **HNSW with `vector_cosine_ops`** — an approximate-nearest-neighbour index.
  Without it every search reads every row and compares 384 numbers each time.
  The operator class must match the distance operator used in the query (`<=>`
  is cosine), or the index is ignored.

Confirm it is all there:

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

SELECT column_name, udt_name
FROM information_schema.columns
WHERE table_name = 'Skill' AND column_name = 'embedding';

SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'Skill' AND indexname LIKE '%embedding%';
```

## CRUD on the vector column

### CREATE

Generate and store embeddings for everything that lacks one:

```bash
cd backend
node backfill-embeddings.js         # only the missing ones
node backfill-embeddings.js --all   # redo everything, after a model change
```

```
Embedding 4 skills with Xenova/all-MiniLM-L6-v2…
  1/4  2/4  3/4  4/4
Done.
```

In SQL a vector is written as a bracketed list cast to `vector`. The real values
come from the model; the shape is:

```sql
UPDATE "Skill"
SET "embedding" = '[0.0123, -0.0456, ... 384 numbers total ...]'::vector
WHERE id = 'demo-sk-calc';
```

This is exactly what `lib/skillSearch.js` does — through `$executeRaw`, because
Prisma has no vector type.

### READ

```sql
-- Which rows have one, and how wide is it
SELECT "skillName",
       (embedding IS NOT NULL) AS has_embedding,
       vector_dims(embedding)  AS dims
FROM "Skill"
ORDER BY "skillName";
```

```
    skillName     | has_embedding | dims
------------------+---------------+------
 Demo Calculus    | t             |  384
 Demo Guitar      | t             |  384
 Demo Photography | t             |  384
 Demo Statistics  | t             |  384
```

```sql
-- The first few numbers, since printing all 384 is unreadable
SELECT "skillName", LEFT(embedding::text, 60) || ' ...' AS first_values
FROM "Skill" WHERE id = 'demo-sk-calc';

-- Vector length. The model returns normalised vectors, so this is ~1.
SELECT "skillName", ROUND(vector_norm(embedding)::numeric, 4) AS norm
FROM "Skill" WHERE embedding IS NOT NULL;
```

> **Never `SELECT *` from `"Skill"` in application code.** The embedding column
> is a vector and the Prisma client cannot deserialise it — the query fails at
> the client, not in the database. Name the columns. In `psql` it is fine.

### UPDATE

Changing the text changes the meaning, so the embedding has to be regenerated:

```sql
UPDATE "Skill"
SET description = 'Multivariable calculus and vector fields',
    "embedding" = NULL            -- mark it stale
WHERE id = 'demo-sk-calc';
```

```bash
node backfill-embeddings.js       # fills in whatever is NULL
```

### DELETE

```sql
-- Drop just the vector, keep the skill
UPDATE "Skill" SET "embedding" = NULL WHERE id = 'demo-sk-calc';

-- Deleting the row takes the vector with it
DELETE FROM "Skill" WHERE id = 'demo-sk-photo';
```

## The feature: similarity search

### Comparing two stored skills

```sql
SELECT a."skillName" AS from_skill,
       b."skillName" AS compared_with,
       ROUND((a.embedding <=> b.embedding)::numeric, 4)       AS cosine_distance,
       ROUND((1 - (a.embedding <=> b.embedding))::numeric, 4) AS similarity
FROM "Skill" a
JOIN "Skill" b ON b.id <> a.id
WHERE a.id = 'demo-sk-calc'
ORDER BY a.embedding <=> b.embedding;
```

`<=>` is cosine distance: 0 is identical, 2 is opposite. Similarity is
`1 - distance`, which is what the search code ranks on.

### Searching with free text

The search text has to be embedded first, which needs the model — so this part
runs through the app rather than psql:

```bash
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:5001/api/users/teachers/search?query=something%20about%20derivatives" \
  | python3 -m json.tool | head -30
```

Or in the UI at `/discover`.

### Is the index being used?

```sql
EXPLAIN ANALYZE
SELECT id, "skillName"
FROM "Skill"
WHERE embedding IS NOT NULL
ORDER BY embedding <=> (SELECT embedding FROM "Skill" WHERE id = 'demo-sk-calc')
LIMIT 5;
```

On a small table Postgres will often choose a sequential scan anyway — with four
rows that is genuinely faster than walking an index. That is the planner being
sensible, not the index being broken. Its existence is what matters at scale.

## Search is hybrid, not purely semantic

`lib/skillSearch.js` scores every row **twice** — once on keyword match, once on
meaning — and ranks on whichever is higher.

Neither alone is good enough. Keyword search misses anything phrased
differently. Pure semantic search is vague when somebody types an exact skill
name and expects that exact skill first. Taking the better of the two gets both.

There is also a relevance floor, so a query that matches nothing returns nothing
rather than the least-bad row in the table. It was measured against real
queries, not guessed, and must be re-measured if the model changes.

## An honest limitation

The model is small, and it shows. Comparing the seeded demo skills:

```
 from_skill    | compared_with    | similarity
---------------+------------------+------------
 Demo Calculus | Demo Photography |     0.3628
 Demo Calculus | Demo Statistics  |     0.3347
 Demo Calculus | Demo Guitar      |     0.2577
```

Calculus comes out marginally closer to *Photography* than to *Statistics*,
which is wrong — the two maths subjects should pair. With only four short
descriptions the distances are all clustered around 0.3 and the ordering is
close to noise.

It works well enough on realistic queries, where the search text is a whole
phrase rather than a two-word title, and the hybrid keyword half carries the
exact-name cases. But it is a known weakness rather than something to claim is
perfect. `lib/embeddings.js` is deliberately one small file so it can be swapped
for a hosted embedding API; the relevance floor in `lib/skillSearch.js` would
need re-measuring afterwards.

## Why this and not a dedicated vector database

Pinecone, Weaviate or Qdrant would all do this. They would also mean a second
server to run, a second thing to keep in sync, and a network hop in the middle
of every search.

The data is already in Postgres, the volume is small, and `pgvector` gives the
same operation — approximate nearest neighbour over an indexed column — inside
the database that already holds the rows. A skill and its embedding stay in one
table, one transaction, one backup.

Worth revisiting at a scale this project will not reach.
