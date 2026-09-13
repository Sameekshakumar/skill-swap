// Generates embeddings for skills that do not have one yet.
//
//   cd backend && node backfill-embeddings.js
//
// Safe to re-run: it only touches rows where the embedding is NULL. Run it
// after adding the vector column, or after changing the model in
// lib/embeddings.js (pass --all to redo every row in that case).
const prisma = require('./lib/prisma');
const { storeEmbedding, } = require('./lib/skillSearch');
const { MODEL } = require('./lib/embeddings');

const redoAll = process.argv.includes('--all');

(async () => {
  const rows = await prisma.$queryRawUnsafe(
    redoAll
      ? 'SELECT "id", "skillName", "level", "description" FROM "Skill" ORDER BY "createdAt"'
      : 'SELECT "id", "skillName", "level", "description" FROM "Skill" WHERE "embedding" IS NULL ORDER BY "createdAt"'
  );

  if (rows.length === 0) {
    console.log('Nothing to do — every skill already has an embedding.');
    return;
  }

  console.log(`Embedding ${rows.length} skill${rows.length === 1 ? '' : 's'} with ${MODEL}…`);

  let done = 0;
  for (const row of rows) {
    await storeEmbedding(row.id, row);
    done += 1;
    process.stdout.write(`\r  ${done}/${rows.length}`);
  }

  console.log('\nDone.');
})()
  .catch((error) => {
    console.error('\nBackfill failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
