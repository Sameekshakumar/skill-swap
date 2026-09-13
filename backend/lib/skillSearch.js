const { Prisma } = require('@prisma/client');
const prisma = require('./prisma');
const { embed, toVectorLiteral, skillText } = require('./embeddings');

// Writing an embedding needs raw SQL: Prisma has no vector type, so the column
// is Unsupported() in the schema and invisible to the generated client.
const storeEmbedding = async (skillId, skill) => {
  const values = await embed(skillText(skill));
  if (!values) return;

  await prisma.$executeRaw`
    UPDATE "Skill"
    SET "embedding" = ${toVectorLiteral(values)}::vector
    WHERE "id" = ${skillId}
  `;
};

// Generating an embedding takes a moment and must never be the reason adding a
// skill fails — the skill is already saved by this point. A skill without one
// still turns up in keyword search, and the backfill script can fill it in.
const storeEmbeddingSafely = (skillId, skill) =>
  storeEmbedding(skillId, skill).catch((error) => {
    console.error(`Could not embed skill ${skillId}:`, error.message);
  });

const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

const SCORE_FLOOR = 0.36;

// Columns are listed one by one rather than `s.*`: the embedding column is a
// vector, and Prisma cannot deserialize it out of a raw query.
const SKILL_COLUMNS = Prisma.sql`
  s."id", s."skillName", s."level", s."creditsPerHour", s."description",
  s."createdAt", s."userId",
  u."id" AS "uid", u."name", u."college", u."yearOfStudy",
  u."bio", u."avatarUrl", u."rating", u."reviewCount"
`;

// Search is hybrid. Keyword matching alone misses anything phrased differently;
// meaning-only matching is vague when somebody types an exact skill name. Each
// row is scored on both and ranked on the better of the two.
const searchSkills = async ({
  viewerId,
  query,
  level,
  maxRate,
  minRating,
  page = 1,
  limit = 12
}) => {
  const filters = [Prisma.sql`s."userId" <> ${viewerId}`];

  if (level && LEVELS.includes(level)) {
    filters.push(Prisma.sql`s."level" = ${level}::"SkillLevel"`);
  }
  if (maxRate) {
    filters.push(Prisma.sql`s."creditsPerHour" <= ${Number(maxRate)}`);
  }
  if (minRating) {
    filters.push(Prisma.sql`u."rating" >= ${Number(minRating)}`);
  }

  const trimmed = String(query ?? '').trim();

  // No search text: plain filtering, best rated first.
  if (!trimmed) {
    const where = Prisma.join(filters, ' AND ');
    const [rows, counted] = await Promise.all([
      prisma.$queryRaw`
        SELECT ${SKILL_COLUMNS}, 0::float AS "score"
        FROM "Skill" s
        JOIN "User" u ON u."id" = s."userId"
        WHERE ${where}
        ORDER BY u."rating" DESC, s."createdAt" DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `,
      prisma.$queryRaw`
        SELECT count(*)::int AS "total"
        FROM "Skill" s JOIN "User" u ON u."id" = s."userId"
        WHERE ${where}
      `
    ]);
    return { rows, total: counted[0]?.total ?? 0 };
  }

  const vector = await embed(trimmed);
  const pattern = `%${trimmed}%`;

  // Keyword score: 1 for a name match, a little less for description or
  // teacher name, 0 otherwise.
  const keyword = Prisma.sql`
    GREATEST(
      CASE WHEN s."skillName" ILIKE ${pattern} THEN 1.0 ELSE 0 END,
      CASE WHEN s."description" ILIKE ${pattern} THEN 0.75 ELSE 0 END,
      CASE WHEN u."name" ILIKE ${pattern} THEN 0.7 ELSE 0 END
    )
  `;

  // Meaning score: cosine distance inverted, so 1 is identical and 0 unrelated.
  // Skills that have no embedding yet score 0 rather than dropping out.
  const semantic = vector
    ? Prisma.sql`COALESCE(1 - (s."embedding" <=> ${toVectorLiteral(vector)}::vector), 0)`
    : Prisma.sql`0::float`;

  const score = Prisma.sql`GREATEST(${keyword}, ${semantic})`;

  // A floor keeps unrelated skills out — without it every row matches to some
  // degree and the whole table comes back for any query.
  //
  // 0.36 was measured against this model, not guessed. Queries that genuinely
  // match scored 0.38 and up ("artificial intelligence" → Machine Learning,
  // 0.38; "learn to play songs" → Guitar, 0.46); ones that should not scored
  // 0.34 and below ("cooking recipes" → Photography, 0.34; "underwater basket
  // weaving", 0.13). Re-measure if the model in lib/embeddings.js changes.
  const where = Prisma.join([...filters, Prisma.sql`${score} >= ${SCORE_FLOOR}`], ' AND ');

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw`
      SELECT ${SKILL_COLUMNS}, ${score}::float AS "score"
      FROM "Skill" s
      JOIN "User" u ON u."id" = s."userId"
      WHERE ${where}
      ORDER BY ${score} DESC, u."rating" DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `,
    prisma.$queryRaw`
      SELECT count(*)::int AS "total"
      FROM "Skill" s JOIN "User" u ON u."id" = s."userId"
      WHERE ${where}
    `
  ]);

  return { rows, total: counted[0]?.total ?? 0 };
};

module.exports = { storeEmbedding, storeEmbeddingSafely, searchSkills };
