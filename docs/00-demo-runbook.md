# Demo runbook

The ten requirements, in the order they are easiest to show, with where each one
lives.

## Before you start

```
# 1. Unpause the Supabase project in the dashboard, then check it answers
cd backend
PGPASSWORD='<db password>' psql "postgresql://postgres.<ref>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres" -c "SELECT 1"

# 2. Redis
redis-cli ping            # expect PONG; if not: brew services start redis

# 3. The app
cd .. && npm run dev      # backend :5001, frontend :3000

# 4. Seed data the queries can actually return. This one LEAVES its rows:
PGPASSWORD='...' psql "<url>" -f docs/demo-seed.sql

# 5. Embeddings for the seeded skills and their modules, so vector search has
#    something to find. Fills both vector columns.
cd backend && node backfill-embeddings.js && cd ..
```

Afterwards, `psql "<url>" -f docs/demo-teardown.sql` removes all of it.

`crud-operations.sql` is separate: it creates its own rows and deletes them
again at the end, so run it for the CRUD section rather than for seeding.

Open three terminal tabs and leave them open: `psql`, `redis-cli`, and the dev
server. Switching between them is most of the demo.

---

## 1. How many users, and their roles

**Easiest in the UI.** Sign in as an admin, click **Admin** in the navbar. The
table shows every account with role, status and credits.

**Then the same thing in SQL** (`docs/demo-queries.sql`, top):

```sql
SELECT COUNT(*) AS total_users FROM "User";
SELECT role, COUNT(*) AS users FROM "User" GROUP BY role;
```

Showing both makes the point that the screen is a view of the table.

## 2. ER diagram

`docs/01-er-diagram.md`. Renders as a diagram on GitHub, or in VS Code with a
Mermaid preview extension.

Be ready for: *why two foreign keys from `Booking` to `User`?* Because teacher
and learner are both users — there is no separate teacher table.

## 3. Converting to a relational schema

`docs/02-schema-conversion.md`. The honest version: this project really did start
in MongoDB, and the document covers what the old shape was, what broke, and how
each piece became a table.

Key beats: nested arrays became `Skill` and `SkillToLearn` (1NF); references
became real foreign keys with per-relationship delete rules; status strings
became enums; the mutable balance gained a `Transaction` ledger.

## 4. Table-to-UI mapping

`docs/03-table-to-ui-mapping.md`. A row per table: which endpoint reads it, which
file, which page, what you see.

The best version of this is live — open `/discover`, then run the `Skill` join
from `demo-queries.sql` and point out that the cards are those rows.

## 5. CRUD on every table

`docs/crud-operations.sql`. Six sections, one per table, each with create, read,
update and delete, plus a teardown.

Run it top to bottom, or paste individual statements. Two things to mention:

- Table names are quoted because Prisma created them capitalised. Unquoted,
  Postgres lowercases them and `"User"` becomes `user`, which does not exist.
- Never `SELECT *` from `"Skill"` in application code — the `embedding` column is
  a pgvector type the Prisma client cannot deserialise. In `psql` it is fine.

## 6. Answering questions live

`docs/demo-queries.sql`, organised simple → complex: counts, single-table
filters, joins, LEFT JOIN, aggregates with HAVING, subqueries.

The end of the file has schema-inspection queries — tables, columns, foreign
keys with delete rules, indexes, triggers — for "prove that exists" questions.

## 7. Trigger, before and after

`docs/04-trigger.md` has the full script. The short version:

```sql
-- before
SELECT name, rating, "reviewCount" FROM "User" WHERE email = 'demo-alice@example.com';
-- insert a review (never mentions the User table)
-- after: rating and reviewCount have changed
```

The point to land: the `INSERT` touched only `"Review"`, yet `"User"` changed.

## 8. The complex nested query, and the recursive one

Bottom of `docs/demo-queries.sql`. Two CTEs, a scalar subquery and a window
function: teachers performing above the platform average, ranked.

Be ready to explain **why the two CTEs are separate** — joining bookings and
reviews in one pass multiplies rows and inflates the credit totals. That is the
part worth understanding, not the syntax.

Above it in the same file is the **recursive** query: completed bookings form a
graph of who taught whom, and `WITH RECURSIVE` walks it. With the seed data it
finds a two-hop chain:

```
 knowledge_from |  reached   | hops |                chain
----------------+------------+------+--------------------------------------
 Demo Alice     | Demo Carol |    2 | Demo Alice -> Demo Bob -> Demo Carol
```

The question to expect is *what stops it looping* — A teaching B and B teaching
A is legal here. The answer is the path array plus `<> ALL(path)`, with a depth
cap behind it.

There is also a **stored procedure**, `adjust_user_credits`, in
`docs/04-trigger.md`'s sibling migration:

```sql
CALL adjust_user_credits('demo-u-bob', 25, 'Demo grant');
SELECT name, "creditBalance", ledger_balance(id) FROM "User" WHERE id = 'demo-u-bob';
```

It refuses a zero amount, a blank reason, an unknown user, and any deduction
that would go below zero. `ledger_balance()` rebuilds the balance from the
`Transaction` rows alone — it should always agree.

## 9. Vector and Redis CRUD

Two datastores to show here, and the rubric weights this heavily.

**Vector** — `docs/06-vector-search.md`. The `pgvector` extension, the
`vector(384)` column, the HNSW index, then CRUD: `backfill-embeddings.js` to
create, `vector_dims`/`vector_norm` to read, `NULL` + backfill to update,
`DELETE` to remove. Finish with a similarity comparison using `<=>`.

Be honest about the limitation documented there — on four short demo
descriptions the distances cluster and the ordering is nearly noise. It works on
realistic queries, and the hybrid keyword half covers exact names.

**Redis**

`docs/05-redis.md`. Plain `SET`/`GET`/`INCR`/`EXPIRE`/`DEL` first, then the live
cache: search on `/discover`, watch `cache:search:*` keys appear, read one, watch
the TTL count down, delete it, watch it return.

Leave `redis-cli MONITOR` running in a spare tab — it shows the app talking to
Redis in real time.

Have the justification ready, because it is the obvious question: rate limiting
sign-ins and caching an expensive search. Both ephemeral, both a poor fit for
Postgres.

## 10. Modifications

Whatever is asked. `backend/smoke-*.js` covers auth, admin, bookings, profile,
reviews, search, users and Redis — run them after any change:

```
cd backend && for f in smoke-*.js; do node $f || break; done
```

---

## Likely questions

**Why both Postgres and Redis?** Postgres holds what must survive. Redis holds
what is only useful — counters that expire, a cache that can be thrown away.
Losing the whole of Redis costs nothing.

**Why UUIDs and not auto-increment integers?** They can be generated without
asking the database, and they do not leak how many users exist.

**Is it normalised?** 3NF, with two deliberate exceptions: `Booking.skill` copies
the skill name so history survives the listing being deleted, and
`User.rating`/`reviewCount` are derived values kept correct by the trigger. Both
are recoverable from other tables.

**How are concurrent bookings handled?** The balance check and the debit are one
statement — `UPDATE ... WHERE creditBalance >= amount`. Zero rows affected means
not enough credits. Two simultaneous requests cannot both pass.

**Where is the password stored?** `User.passwordHash`, bcrypt with cost 10. It is
stripped in `lib/profile.js` before any response, and `smoke-auth.js` asserts it
never appears in `/auth/me` or `/profile`.

**What stops a user reaching the admin pages?** The role is read from the
database on every request, not carried in the token, so suspending or demoting
someone takes effect immediately. The frontend route only hides the page; every
`/api/admin` route checks again server-side.
