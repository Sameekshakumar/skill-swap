// Turns text into an embedding: a fixed-length list of numbers that stands in
// for the meaning of the text. Two descriptions that mean similar things end up
// with similar numbers, which is what lets search match "I want to learn an
// instrument" against "acoustic fingerstyle lessons".
//
// The model runs locally. It is downloaded once (~90MB) into node_modules on
// first use and cached there, so there is no API key, no per-call cost and no
// network dependency after that first run.

const MODEL = 'Xenova/all-MiniLM-L6-v2';

// Must match the column width in the migration. Changing the model means
// changing this and re-running the backfill.
const DIMENSIONS = 384;

let pipelinePromise = null;

// Loaded lazily so that starting the server stays fast — the model is only
// pulled in the first time something actually needs an embedding.
const getPipeline = async () => {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await import('@xenova/transformers');
      return pipeline('feature-extraction', MODEL);
    })();
  }
  return pipelinePromise;
};

const embed = async (text) => {
  const input = String(text ?? '').trim();
  if (!input) return null;

  const extractor = await getPipeline();
  // Mean pooling with normalisation is what this model expects; normalised
  // vectors also make cosine distance comparisons cheap in Postgres.
  const output = await extractor(input, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
};

// pgvector accepts a bracketed list, e.g. '[0.01,-0.2,...]'.
const toVectorLiteral = (values) => `[${values.join(',')}]`;

// What a skill's embedding is actually built from. The description carries the
// meaning, but the name and level matter too — "Guitar" alone should still
// match somebody searching for guitar.
const skillText = ({ skillName, level, description }) =>
  [skillName, level, description].filter(Boolean).join('. ');

module.exports = { embed, toVectorLiteral, skillText, DIMENSIONS, MODEL };
