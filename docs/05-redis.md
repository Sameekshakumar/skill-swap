# Redis: the second datastore

Requirement 9. Code in `backend/lib/redis.js`, tested by `backend/smoke-redis.js`.

## Why there is a second database at all

Redis was deliberately left out of this project for months, because "we should
use Redis" is not a reason. It earns its place here by doing two jobs Postgres
is genuinely a poor fit for.

**1. Rate limiting sign-in attempts.** Since the app moved from Google sign-in to
its own passwords, brute force became a real risk. Counting attempts needs a
counter that expires by itself — a row per failed login would be write-heavy
rubbish that then needs cleaning up. Redis `INCR` plus `EXPIRE` is two commands
and the key deletes itself.

**2. Caching search results.** Searching runs a vector comparison across every
skill. The same filters produce the same answer, so the result is cached for 60
seconds. Postgres could store a cache, but then the cache lives in the thing you
are trying to protect.

Both are *ephemeral* data: losing all of it costs nothing. That is the dividing
line — Postgres holds what must survive, Redis holds what is merely useful.

## How the two are used

| Key pattern | Written by | Type | TTL | Purpose |
|-------------|-----------|------|-----|---------|
| `ratelimit:login:<ip>:<email>` | `routes/auth.js` | counter | 15 min | 10 attempts per IP+email, cleared on success |
| `cache:search:<userId>:<filters>` | `routes/users.js` | JSON string | 60 s | Cached search page; dropped when any skill changes |

## CRUD, from redis-cli

Start a shell:

```
redis-cli
```

### CREATE

```
SET demo:skill "Calculus"
OK

SET demo:expiring "gone in 60 seconds" EX 60
OK

INCR demo:counter
(integer) 1
```

### READ

```
GET demo:skill
"Calculus"

TTL demo:expiring
(integer) 57

KEYS demo:*
1) "demo:skill"
2) "demo:expiring"
3) "demo:counter"

EXISTS demo:skill
(integer) 1
```

### UPDATE

```
SET demo:skill "Advanced Calculus"
OK

GET demo:skill
"Advanced Calculus"

INCR demo:counter
(integer) 2

EXPIRE demo:skill 120
(integer) 1
```

### DELETE

```
DEL demo:skill
(integer) 1

GET demo:skill
(nil)

DEL demo:expiring demo:counter
(integer) 2
```

## Showing the live cache

This is the better demo, because it is the application's own data.

**1. Watch the keys appear.** Sign in, then search on `/discover`:

```
redis-cli KEYS 'cache:search:*'
```

**2. Read one.** The value is the exact JSON the browser received:

```
redis-cli GET "cache:search:<paste a key from above>"
redis-cli TTL "cache:search:<same key>"
```

The TTL counts down from 60.

**3. Prove the cache is being hit.** In the browser's network tab, the search
request carries `X-Cache: MISS` the first time and `X-Cache: HIT` on repeat —
or from the terminal:

```
curl -s -D - -o /dev/null \
  -H "Authorization: Bearer <token>" \
  "http://localhost:5001/api/users/teachers/search?query=calculus" | grep -i x-cache
```

**4. Delete the key and watch it come back as a MISS.**

```
redis-cli DEL "cache:search:<key>"
```

**5. Show invalidation.** Add a skill on `/profile` and the cached pages vanish
immediately rather than waiting out the TTL:

```
redis-cli KEYS 'cache:search:*'
```

## Showing rate limiting

```
# fail a login a few times
for i in 1 2 3; do
  curl -s -X POST http://localhost:5001/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"demo-bob@example.com","password":"wrong"}' | head -c 60; echo
done

# the counter Redis is keeping
redis-cli KEYS 'ratelimit:login:*'
redis-cli GET  'ratelimit:login:<ip>:demo-bob@example.com'
redis-cli TTL  'ratelimit:login:<ip>:demo-bob@example.com'
```

Past 10 attempts the API returns `429 Too many sign-in attempts`. A successful
login runs `DEL` on the key.

## Useful inspection commands

```
redis-cli PING              # is it up? -> PONG
redis-cli INFO keyspace     # how many keys
redis-cli DBSIZE            # count
redis-cli --scan            # every key, without blocking the server
redis-cli MONITOR           # live stream of commands — good to leave running
```

`MONITOR` in a second terminal during a search is the clearest way to show the
app actually talking to Redis.

### Do not run FLUSHDB on this machine

This Redis instance holds keys from other work — `cgpa`, `srn`, `sname`,
`user:1` and friends, from a separate exercise. `FLUSHDB` and `FLUSHALL` would
delete them along with ours.

Everything this app writes is prefixed, so scan by prefix instead:

```
redis-cli --scan --pattern 'cache:search:*'
redis-cli --scan --pattern 'ratelimit:login:*'
```

To remove only our keys:

```
redis-cli --scan --pattern 'cache:search:*' | while IFS= read -r k; do redis-cli DEL "$k"; done
```

The `while read` loop rather than `xargs`: the cache keys contain braces and
quotes, which `xargs` mangles.

If the mixed keyspace is distracting during the demo, point the app at a
different Redis database instead of deleting anything:

```
# backend/.env
REDIS_URL=redis://localhost:6379/1
```

Then `redis-cli -n 1 --scan` shows only this app's keys.

## If Redis is not running

Everything still works. `lib/redis.js` fails open deliberately: rate limiting
allows the request, the cache always misses, and the app logs a warning at
startup. A demo laptop without `redis-server` can still sign in and search.

Start it with:

```
brew services start redis     # or: redis-server
redis-cli ping                # expect PONG
```
