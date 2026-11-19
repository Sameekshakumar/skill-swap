// Generates embeddings for skills that do not have one yet.
//
//   cd backend && node backfill-embeddings.js
//
// Covers both vector columns: "Skill"."embedding" and "SkillModule"."embedding".
// Modules carry their own, because folding their text into the skill's vector
// was measured and it made search worse (see lib/embeddings.js).
//
// Safe to re-run: it only touches rows where the embedding is NULL. Run it
// after adding the vector column, or after changing the model in
// lib/embeddings.js (pass --all to redo every row in that case).
const prisma = require('./lib/prisma');
const { storeEmbedding, storeModuleEmbedding } = require('./lib/skillSearch');
const { MODEL } = require('./lib/embeddings');

const redoAll = process.argv.includes('--all');

const embedAll = async (label, rows, store) => {
  if (rows.length === 0) {
    console.log(`${label}: nothing to do.`);
    return;
  }

  console.log(`${label}: embedding ${rows.length} row${rows.length === 1 ? '' : 's'}…`);

  let done = 0;
  for (const row of rows) {
    await store(row.id, row);
    done += 1;
    process.stdout.write(`\r  ${done}/${rows.length}`);
  }
  process.stdout.write('\n');
};

(async () => {
  console.log(`Model: ${MODEL}`);

  const skills = await prisma.$queryRawUnsafe(
    redoAll
      ? 'SELECT "id", "skillName", "level", "description" FROM "Skill" ORDER BY "createdAt"'
      : 'SELECT "id", "skillName", "level", "description" FROM "Skill" WHERE "embedding" IS NULL ORDER BY "createdAt"'
  );

  // Columns are listed rather than m.* — the vector column cannot be
  // deserialised by Prisma out of a raw query.
  const modules = await prisma.$queryRawUnsafe(
    redoAll
      ? 'SELECT "id", "title", "content" FROM "SkillModule" ORDER BY "createdAt"'
      : 'SELECT "id", "title", "content" FROM "SkillModule" WHERE "embedding" IS NULL ORDER BY "createdAt"'
  );

  await embedAll('Skills', skills, storeEmbedding);
  await embedAll('Modules', modules, storeModuleEmbedding);

  console.log('Done.');
})()
  .catch((error) => {
    console.error('\nBackfill failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
