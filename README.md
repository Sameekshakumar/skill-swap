# Skill Swap

A credit-based skill exchange for students. Teach somebody something for an hour and you earn
credits; spend those credits to learn something yourself. No money changes hands, and nobody
can take a lesson they have not earned.

```
          teaches Calculus (2 credits/hr)
   Alice ──────────────────────────────▶ Bob
         ◀──────────────────────────────
              teaches Guitar (1 credit/hr)
```

---

## How it works

1. **List what you teach.** A skill, its level, a short description, and what an hour of it is
   worth — between one and three credits. You can list what you want to learn too.
2. **Find someone.** Search is hybrid: it scores every listing on both keyword match and
   meaning, so "something about calculus" finds *Advanced Calculus* even without the exact word.
3. **Request a session.** Your credits are set aside the moment you ask, so a session can never
   be booked without the credits to cover it.
4. **Both confirm.** After the session you each mark it complete. Only when both agree do the
   credits reach the teacher. Then you can review each other.

Everyone starts with 10 credits. Declining or cancelling refunds them in full.

## Features

- **Email and password sign-in**, hashed with bcrypt. Wrong password and unknown email return
  the same error, so the login form cannot be used to discover who has an account.
- **Two roles.** Regular users and admins. Admins can list and search every account, suspend
  or reinstate, promote or demote, adjust credits, and moderate content.
- **A credit ledger.** Every balance change writes a `Transaction` row, so the number can
  always be explained.
- **Semantic search** over skills, using a 384-dimension embedding stored in pgvector and
  compared by cosine distance. The model runs locally — no API key, no per-query cost.
- **Light and dark themes**, and a glass design system driven entirely by CSS custom properties.

## Tech

| Layer | What |
|---|---|
| Frontend | React 18, TypeScript, Vite, React Router, plain CSS |
| Backend | Node.js, Express, Prisma 6 |
| Database | PostgreSQL on Supabase, with the `pgvector` extension |
| Cache | Redis — login rate limiting and search caching |
| Auth | Own JWT (30 days), bcrypt password hashes |
| Embeddings | `@xenova/transformers`, `all-MiniLM-L6-v2`, running locally |

**Why two databases?** Postgres holds what must survive. Redis holds what is only useful — a
login counter that expires by itself, and a 60-second cache in front of the most expensive
query in the app. Losing all of Redis costs nothing, and the app keeps working without it.

## Layout

```
backend/
  routes/        auth, profile, users, bookings, reviews, admin
  middleware/    JWT verification, role checks
  lib/           Prisma and Redis clients, search, embeddings, shared shapes
  prisma/        schema and migrations
  smoke-*.js     end-to-end checks against a running server
  make-admin.js  promote an account to admin
frontend/
  src/pages/     landing, login, welcome, discover, sessions, profile, teacher, admin
  src/components/
  src/contexts/  auth, theme, in-page feedback
  src/styles/    design system and the bridge onto it
docs/            ER diagram, schema notes, SQL command sheets, demo runbook
```

---

## Running it

**Prerequisites:** Node 18+, a Supabase Postgres project, and Redis (optional — the app runs
without it).

```bash
npm run install-all     # root, backend and frontend
npm run dev             # backend on :5001, frontend on :3000
```

Open <http://localhost:3000>.

### Environment

`backend/.env` — **not** the repo root. `dotenv` resolves it from the backend directory.

```env
DATABASE_URL=postgresql://...   # Supabase session pooler connection string
JWT_SECRET=...                  # any long random string
PORT=5001
REDIS_URL=redis://localhost:6379   # optional, this is the default
```

Gitignored, and the only file holding secrets. The frontend needs no environment file.

> If your database password contains `#`, `@`, `/` or `:`, percent-encode it in
> `DATABASE_URL` — `#` becomes `%23`. Unencoded, Postgres silently receives a truncated
> password and the error says only "password authentication failed".

### Creating the first admin

Registration always creates a regular user; the API has no way to mint an admin. Register in
the app, then:

```bash
cd backend
node make-admin.js you@example.com
```

After that, admins promote each other from the `/admin` panel. There is no limit on how many.

### Redis

```bash
brew services start redis    # or just: redis-server
redis-cli ping               # expect PONG
```

Skip it if you like. Rate limiting then allows everything and the cache always misses — the
app logs a warning at startup and otherwise behaves normally.

### Database

The schema lives in `backend/prisma/schema.prisma`.

```bash
cd backend
npx prisma migrate dev --name <name>   # create and apply a migration
npx prisma migrate deploy              # apply existing migrations
npx prisma studio                      # browse the data
```

Use the Supabase **session pooler** connection string. The direct `db.<ref>.supabase.co` host
has no IPv4 address, and Prisma's engine will not resolve an IPv6-only host — it fails with
`P1001` even though the host is reachable.

> **Never** pass the live database as `--shadow-database-url`. Prisma resets whatever it is
> given as a shadow database. This has wiped the database once already.

Free Supabase projects pause after about a week idle. A paused project reports
`FATAL: tenant/user ... not found`, which looks exactly like a wrong password. Check the
dashboard before debugging the connection string.

---

## Data model

Six tables: `User`, `Skill`, `SkillToLearn`, `Booking`, `Transaction`, `Review`.
Full diagram and notes in [`docs/01-er-diagram.md`](docs/01-er-diagram.md).

Two parts worth knowing:

**`Booking` references `User` twice** — once as `teacherId`, once as `learnerId`. There is no
separate teacher table, because everyone is both.

**`User.rating` and `User.reviewCount` are maintained by a database trigger.**
`review_rating_sync_trigger` fires on every insert, update and delete against `Review` and
recomputes them with `AVG`. The application never does this arithmetic — which means a review
inserted by hand in `psql` updates the rating just the same.

## API

All routes are under `/api`. Everything except `POST /auth/register` and `POST /auth/login`
needs `Authorization: Bearer <token>`.

### Auth

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create an account; always a regular user |
| POST | `/auth/login` | Sign in. Rate limited to 10 attempts per 15 minutes |
| GET | `/auth/me` | The signed-in user |

### Profile and skills

| Method | Path | Purpose |
|---|---|---|
| GET | `/profile` | Own profile, with both skill lists |
| PUT | `/profile` | Update name, college, year, bio |
| POST | `/profile/skills/teach` | Add a teaching skill |
| DELETE | `/profile/skills/teach/:skillId` | Remove one |
| POST | `/profile/skills/learn` | Add a skill you want to learn |
| DELETE | `/profile/skills/learn/:skillName` | Remove one |

### Discovery

| Method | Path | Purpose |
|---|---|---|
| GET | `/users/teachers/search` | Hybrid search — `query`, `level`, `maxRate`, `minRating`, `page`, `limit` |
| GET | `/users/:id` | A teacher's public profile |

### Bookings

| Method | Path | Purpose |
|---|---|---|
| GET | `/bookings` | Everything you are part of |
| POST | `/bookings` | Request a session |
| POST | `/bookings/:id/accept` | Teacher accepts |
| POST | `/bookings/:id/reject` | Teacher declines, credits refunded |
| POST | `/bookings/:id/cancel` | Learner cancels, credits refunded |
| POST | `/bookings/:id/complete` | Mark complete; credits move once both have |
| POST | `/bookings/reset` | Cancel all your pending requests, refunded |
| GET | `/bookings/requests`, `/my-requests`, `/upcoming`, `/completed` | Filtered views |

### Reviews

| Method | Path | Purpose |
|---|---|---|
| POST | `/reviews` | Review the other person in a completed session |
| GET | `/reviews/user/:userId`, `/my-reviews`, `/received`, `/pending` | Review lists |

### Admin

Every route below requires the `admin` role, checked against the database on each request.

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/users` | List and search accounts — `query`, `page`, `limit` |
| PATCH | `/admin/users/:id/status` | Suspend or reinstate |
| PATCH | `/admin/users/:id/role` | Promote or demote |
| DELETE | `/admin/users/:id` | Delete; refused for accounts with bookings |
| POST | `/admin/users/:id/credits` | Grant or deduct, with a reason |
| DELETE | `/admin/reviews/:id` | Remove a review |
| DELETE | `/admin/skills/:id` | Remove a skill listing |
| POST | `/admin/bookings/:id/cancel` | Cancel any booking, refunding the learner |

## How the rules are enforced

**Credits.** Every movement runs inside a database transaction. Requesting debits the learner
and records a `Lock`; declining, cancelling or resetting refunds them; completing pays the
teacher, but only once both sides confirm.

Each state change is a conditional update that also matches on the current status, so only the
caller that actually changes the status moves any credits. That is what prevents a double
refund or a double payout. The balance check and the debit are a single statement:

```sql
UPDATE "User" SET "creditBalance" = "creditBalance" - $1
WHERE id = $2 AND "creditBalance" >= $1;   -- 0 rows = not enough credits
```

Two simultaneous requests cannot both pass it.

A booking's price always comes from the teacher's own `Skill` row, never from the request body.

**Roles.** The role is read from the database on every request rather than carried in the
token, so suspending or demoting somebody takes effect immediately instead of whenever their
30-day token expires. The frontend route guard only hides the admin page; the server checks
again regardless.

**Passwords** are bcrypt hashes in `User.passwordHash`, stripped in `lib/profile.js` before
any response. Two test suites assert the hash never reaches a client.

## Tests

Eight suites in `backend/smoke-*.js`, run against a live server and the real database.

```bash
npm run dev
cd backend && for f in smoke-*.js; do node $f || break; done
```

They create and clean up their own `smoke-*@example.com` accounts. `smoke-redis.js` is the
exception — it needs only a running Redis, no server and no Postgres.

The frontend typechecks before it builds:

```bash
cd frontend && npm run build     # tsc --noEmit && vite build
npm run typecheck                # typecheck alone
```

## Documentation

`CLAUDE.md` is the working notebook — architecture decisions, conventions, and the traps that
have cost real time.

`docs/` holds the database material:

| File | What |
|---|---|
| [`00-demo-runbook.md`](docs/00-demo-runbook.md) | Walkthrough tying the rest together |
| [`01-er-diagram.md`](docs/01-er-diagram.md) | Entity-relationship diagram and relationship notes |
| [`02-schema-conversion.md`](docs/02-schema-conversion.md) | How the original MongoDB model became a relational one |
| [`03-table-to-ui-mapping.md`](docs/03-table-to-ui-mapping.md) | Which table appears on which screen |
| [`04-trigger.md`](docs/04-trigger.md) | The rating trigger, with a before-and-after script |
| [`05-redis.md`](docs/05-redis.md) | What Redis does here and how to inspect it |
| [`crud-operations.sql`](docs/crud-operations.sql) | Create, read, update and delete on all six tables |
| [`demo-queries.sql`](docs/demo-queries.sql) | Queries from simple counts to a ranked nested query |

Both `.sql` files run clean top to bottom and clean up after themselves.

## Known limits

- **Not deployed.** Localhost only. The frontend proxies `/api` through the Vite dev server,
  which is a development feature — production needs a real API base URL.
- **No password reset or email verification.** Both need an email sender.
- **Admin content moderation has no UI.** The endpoints work and are tested, but only the user
  panel is built.
- **The `Transaction` ledger has no screen.** It is written correctly; read it with SQL.
- **The embedding model is small** and it shows: vague phrasing sometimes misses an obvious
  match. `lib/embeddings.js` is one file precisely so it can be swapped for a hosted API.
