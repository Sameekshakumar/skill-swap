// Redis: the second datastore, used for the two things Postgres is a poor fit
// for — short-lived counters and a throwaway cache.
//
// Everything in here is deliberately optional. If Redis is not running the app
// keeps working: rate limiting lets requests through and the cache always
// misses. A demo laptop without `redis-server` should still be able to sign in.
const { createClient } = require('redis');

const url = process.env.REDIS_URL || 'redis://localhost:6379';

const client = createClient({ url });

let ready = false;

// Without a listener, a dropped connection throws an unhandled error event and
// takes the whole process down.
client.on('error', (err) => {
  if (ready) {
    console.error('Redis error:', err.message);
    ready = false;
  }
});
client.on('ready', () => { ready = true; });

// Connect in the background: a slow or absent Redis must not delay startup.
client.connect().catch((err) => {
  console.warn(`Redis unavailable at ${url} (${err.message}). Rate limiting and caching are disabled.`);
});

const isReady = () => ready;

// --- Rate limiting -------------------------------------------------------
//
// One counter per key, expiring after `windowSeconds`. INCR returns the new
// value, so the first hit in a window is the one that sets the expiry.
// Returns { allowed, remaining, retryAfter }.
const hit = async (key, limit, windowSeconds) => {
  if (!ready) return { allowed: true, remaining: limit, retryAfter: 0 };

  try {
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSeconds);
    }

    if (count > limit) {
      const ttl = await client.ttl(key);
      return { allowed: false, remaining: 0, retryAfter: ttl > 0 ? ttl : windowSeconds };
    }

    return { allowed: true, remaining: limit - count, retryAfter: 0 };
  } catch (err) {
    // A broken cache must never lock people out of the app.
    console.error('Redis rate limit failed open:', err.message);
    return { allowed: true, remaining: limit, retryAfter: 0 };
  }
};

// Clear a counter — used after a successful login, so a few typos followed by
// the right password do not count against the next attempt.
const reset = async (key) => {
  if (!ready) return;
  try {
    await client.del(key);
  } catch (err) {
    console.error('Redis reset failed:', err.message);
  }
};

// --- Caching -------------------------------------------------------------

const getJson = async (key) => {
  if (!ready) return null;
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('Redis read failed:', err.message);
    return null;
  }
};

const setJson = async (key, value, ttlSeconds) => {
  if (!ready) return;
  try {
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    console.error('Redis write failed:', err.message);
  }
};

// Drop every key under a prefix. SCAN rather than KEYS: KEYS blocks the server
// while it walks the whole keyspace.
const dropPrefix = async (prefix) => {
  if (!ready) return 0;
  try {
    let removed = 0;
    // node-redis v5+ yields a batch of keys per iteration, not one key.
    for await (const batch of client.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
      const keys = Array.isArray(batch) ? batch : [batch];
      if (keys.length === 0) continue;
      removed += await client.del(keys);
    }
    return removed;
  } catch (err) {
    console.error('Redis invalidation failed:', err.message);
    return 0;
  }
};

module.exports = { client, isReady, hit, reset, getJson, setJson, dropPrefix };
