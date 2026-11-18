// Smoke test for the Redis layer. Unlike the other suites this one needs no
// server and no Postgres — just a running redis-server.
//
//   node smoke-redis.js
const assert = require('assert');
const redis = require('./lib/redis');

const PREFIX = 'smoke:redis:';

const waitForReady = async (attempts = 20) => {
  for (let i = 0; i < attempts; i += 1) {
    if (redis.isReady()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

(async () => {
  if (!(await waitForReady())) {
    console.error('redis smoke test skipped: no redis-server on ' + (process.env.REDIS_URL || 'redis://localhost:6379'));
    process.exit(1);
  }

  // --- cache: create, read, delete ---
  const key = `${PREFIX}cache`;
  assert.strictEqual(await redis.getJson(key), null, 'a fresh key should miss');

  await redis.setJson(key, { results: [1, 2, 3], total: 3 }, 60);
  const read = await redis.getJson(key);
  assert.deepStrictEqual(read, { results: [1, 2, 3], total: 3 }, 'cached value came back wrong');

  // Overwrite, i.e. the update half of CRUD.
  await redis.setJson(key, { results: [], total: 0 }, 60);
  assert.deepStrictEqual(await redis.getJson(key), { results: [], total: 0 }, 'overwrite did not take');

  // The TTL is actually set — without it the cache would never expire.
  const ttl = await redis.client.ttl(key);
  assert.ok(ttl > 0 && ttl <= 60, `expected a TTL between 1 and 60, got ${ttl}`);

  // --- prefix invalidation ---
  await redis.setJson(`${PREFIX}drop:a`, { n: 1 }, 60);
  await redis.setJson(`${PREFIX}drop:b`, { n: 2 }, 60);
  const removed = await redis.dropPrefix(`${PREFIX}drop:`);
  assert.strictEqual(removed, 2, `expected to drop 2 keys, dropped ${removed}`);
  assert.strictEqual(await redis.getJson(`${PREFIX}drop:a`), null, 'invalidation missed a key');
  // The unrelated key is untouched — a prefix drop must not clear everything.
  assert.ok(await redis.getJson(key), 'prefix drop removed an unrelated key');

  // --- rate limiting ---
  const limitKey = `${PREFIX}limit`;
  await redis.reset(limitKey);

  for (let i = 1; i <= 3; i += 1) {
    const result = await redis.hit(limitKey, 3, 60);
    assert.strictEqual(result.allowed, true, `attempt ${i} of 3 should be allowed`);
    assert.strictEqual(result.remaining, 3 - i, `remaining wrong on attempt ${i}`);
  }

  const blocked = await redis.hit(limitKey, 3, 60);
  assert.strictEqual(blocked.allowed, false, 'the 4th attempt past a limit of 3 was allowed');
  assert.ok(blocked.retryAfter > 0, 'a blocked attempt should report when to retry');

  // A successful sign-in clears the counter.
  await redis.reset(limitKey);
  assert.strictEqual((await redis.hit(limitKey, 3, 60)).allowed, true, 'reset did not clear the counter');

  // --- cleanup ---
  await redis.dropPrefix(PREFIX);
  assert.strictEqual(await redis.getJson(key), null, 'cleanup left keys behind');

  await redis.client.quit();
  console.log('redis smoke test passed');
})().catch(async (err) => {
  await redis.dropPrefix(PREFIX).catch(() => {});
  await redis.client.quit().catch(() => {});
  console.error(err.message);
  process.exit(1);
});
