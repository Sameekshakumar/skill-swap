# skill-swap

Credit-based peer-to-peer skill exchange. Students list skills to teach/learn, book sessions, pay in credits, leave reviews.

## Layout

```
backend/    Express API (server.js, routes/, middleware/, lib/, prisma/)
frontend/   React 18 + TS + Vite + Tailwind 4
```

Root `package.json` is scripts only (`concurrently`).

## Run

```
npm run install-all   # root + backend + frontend
npm run dev           # backend :5001 + frontend :3000
```

Frontend calls relative `/api`; Vite proxies to `localhost:5001` (`frontend/vite.config.js`). No `VITE_API_URL`.

## Backend

- Auth: **email and password, hashed with bcrypt and stored in `User.passwordHash`.**
  `POST /api/auth/register` and `POST /api/auth/login` both return `{ token, user }`; the
  token is our own JWT (30d). `middleware/auth.js` verifies it and puts
  `{ id, email, name, role, creditBalance }` on `req.user`. Google sign-in was removed —
  there is no `googleId`, no `google-auth-library`, and no client id in either `.env`.
- **Login replies identically for a wrong password and an unknown email** (`401 Invalid email
  or password`), and compares against a dummy hash when no user is found. Telling the two
  apart lets anyone test which addresses have accounts.
- **`/auth/register` never reads `role` from the body.** Everyone registers as `user`. The
  first admin is made with `node make-admin.js <email>`; after that an admin can promote
  others through `PATCH /api/admin/users/:id/role`.
- Validation: `express-validator` `check()` arrays inline in route definitions.
- Routes mounted in `server.js`: `/api/auth`, `/api/bookings`, `/api/users`, `/api/profile`,
  `/api/reviews`, `/api/admin`.
  `/api/users` now has exactly one endpoint, `GET /teachers/search` — the CRUD endpoints under it
  were unused and were removed.
- Models live in `prisma/schema.prisma`: `User`, `Skill`, `SkillModule`, `SkillToLearn`,
  `Booking`, `Transaction`, `Review`. `creditBalance` defaults to 10.
- **`SkillModule` is a skill's curriculum** — an ordered list (`position`, 0-based) of
  what the sessions cover, the way a course page lists its sections. It is the only
  second-level child: it hangs off `Skill`, not `User`. `POST`/`DELETE
  /profile/skills/teach/:skillId/modules[/:moduleId]`, both scoped to the owner (404
  otherwise). Cascades when the skill goes.
- `lib/httpError.js` — throw `HttpError(status, message)` inside a `$transaction` to roll it
  back with a real status code; `sendError(res, err, fallback)` in the catch.
- `lib/profile.js` — the shared "user minus password, with both skill lists" shape. It
  spreads the whole user row, so **anything secret added to `User` must be stripped here** —
  this one function is what `/auth/me` and `GET /profile` both return.
- `lib/bookingCancel.js` — `cancelWithRefund`, shared by the learner's cancel, the teacher's
  reject and the admin cancel so all three move credits identically.

## Frontend

- `src/utils/axios.ts` — the shared axios instance. Attaches the JWT from `localStorage` via interceptor. Use it, don't call axios directly.
- `src/contexts/AuthContext.tsx` — auth state.
- Mixed `.tsx` + per-page plain `.css` files. No CSS modules.

## Env

`backend/.env` is the one the server actually loads — `dotenv` resolves it from the backend
working directory, not the repo root. Keys: `DATABASE_URL`, `JWT_SECRET`, `PORT`.
Both `.env` files are gitignored — never commit them.

## Database and migrations

Prisma 6 + Supabase Postgres. Prisma 7 is **not** usable here without extra wiring (it dropped
`url` from `datasource` and needs a driver adapter) — both deps are pinned `^6`.

Everything below reflects the app as it stands. `mongoose` is gone, the schema lives in
`prisma/schema.prisma`, and the frontend reads `id` throughout.

### Migration workflow

```
cd backend
npx prisma migrate dev --name <name>
```

This needs the **session pooler** URL. It does not work over the direct
`db.<ref>.supabase.co` host — see below.

**Never pass the live database as `--shadow-database-url`.** Prisma resets whatever it is
given as a shadow database; pointing it at `DATABASE_URL` drops every table and wipes the
migration history. If `migrate dev` cannot prompt (a non-interactive shell) and refuses
because a column drop loses data, generate the SQL with `migrate diff --from-migrations ...
--to-schema-datamodel ...` and no shadow flag, then `migrate deploy`.

### Supabase connection

Use the session pooler URI (Dashboard → Connect → Session mode), currently
`aws-0-ap-northeast-2.pooler.supabase.com:5432` with the `postgres.<project-ref>` username.

Do not switch to the direct `db.<ref>.supabase.co` host. It has no A record, and Prisma's
engine will not resolve an AAAA-only host — it fails `P1001` even though plain TCP to that
host works. The pooler also fixes `migrate dev`, which could not create its shadow database
over the direct connection.

### Conventions

- Password hashing is explicit (`bcrypt.hash(password, 10)` at the call site) — the mongoose
  `pre('save')` hook is gone. Any route that sets a password must hash it itself.
- Email/name normalization is explicit too (`trim`/`toLowerCase`) — no schema-level coercion.
- API responses expose `id`, not `_id`, on both the backend and the frontend.
- `/api/auth/me` and `GET /profile` flatten `skillsToLearn` to a string array to match the
  old Mongo shape.

### Routes

`/` is the public landing page. Signed-in visitors are redirected off it to `/discover`,
which is where the old `/` app view now lives. `/login`, `/welcome`, `/dashboard`,
`/profile` and `/teachers/:id` are unchanged.

### UI structure

- `components/layout/Layout.tsx` renders `Navbar` + `<Outlet/>` and wraps every signed-in
  route. Pages must **not** draw their own header nav — they did, which is why "My Sessions"
  vanished on the discover page.
- **`styles/design-system.css` owns the palette** (tokens are `--ss-*`, keyed off `data-theme`).
  `styles/theme.css` is the only bridge, mapping the app's own variable names onto its tokens.
  Page stylesheets must declare neither `:root` variables nor raw hex — three of them did,
  which broke dark mode. `ThemeContext` sets the attribute and persists the choice.
- **Nothing above the ambient layer may be opaque.** `AmbientBackground` is fixed at
  `z-index: -10`; `<body>` paints the ground. An opaque page wrapper hides the blobs
  completely, with no error — the single easiest way to break the look.
- Headings use `--ss-font-display` (Playfair Display, loaded in `index.html`); body copy
  stays sans. Panels use the one glass recipe listed in `theme.css`, never a flat fill.
- Icons should use the `.ss-icon` mask so one black PNG serves both themes and any colour.
- **Colour belongs in `styles/theme.css`, never in a page or component stylesheet.** A local
  declaration wins on equal specificity because page styles are imported later, so the theme
  silently loses. Status and action colours are tokens too (`--status-*`, `--action-*`) —
  distinct hues, but themed.
- **Never use `overflow-x: hidden` on `html` or `body`.** It turns them into scroll
  containers, which silently stops `position: sticky` working anywhere on the page — that is
  what broke the landing page's card stack. `overflow-x: clip` clips without that side effect.
- `hooks/useReveal.ts` fades `[data-reveal]` elements in on scroll. Pass it a `ready` flag —
  it runs before a component's early returns, so without one the observer looks for elements
  during the loading render, finds none, and leaves the page stuck at opacity 0.
- `.page-shell` (72rem, 2rem padding) is the shared width. The navbar and every page use it,
  so headings line up with the cards below them.
- `.glass-pill` is the frosted navbar control — used by links, the credit badge and the
  theme switch.
- **No emoji in the UI.** They were removed pending real icons; don't reintroduce them.
- **No `alert` or `confirm`.** `FeedbackContext` provides `notify(message, tone)` and an
  awaitable `confirm(message, label)`; both render in-page instead of blocking it.
- The credit balance lives in `AuthContext` and renders once in the navbar. After anything
  that moves credits, call `refreshUser()` rather than tracking a local copy.

### Frontend rules

- `AuthContext` exposes `loading`, true until the saved token has been checked. `ProtectedRoute`
  renders nothing while it is true — without that, every hard refresh of a protected page
  redirects to `/login` before the session finishes restoring.
- Never log request bodies. An axios interceptor used to print every request, passwords included.
- `/users/teachers/search` returns one row per skill, so `skillId` is the React key — `teacherId`
  repeats for a teacher offering several skills.
- The discover page shows only real teachers. It used to fall back to hardcoded mock teachers
  whose ids matched nothing, so booking them failed with a confusing error.
- `frontend/npm run build` typechecks first (`tsc --noEmit && vite build`). `npm run typecheck`
  runs it alone.

### Product rules worth keeping

- **Sessions are booked in whole hours.** Credits are integers and pricing is per hour, so a
  half-hour booking cannot produce a fair credit amount. The duration dropdown offers 1-3 hours.
- **A booking's price always comes from the teacher's `Skill` row**, never the request body.
  Booking a skill the teacher does not offer is a 400.
- **Sessions must be scheduled in the future.**

### Credit rules (bookings.js)

Credits move in one direction and every move is wrapped in a `$transaction`:

- **Request** debits the learner immediately (`Lock`, negative amount). The debit and the
  balance check are one `updateMany` with `creditBalance: { gte: amount }` — never read the
  balance and write it back separately.
- **Reject / cancel / reset** refund the learner (`Refund`, positive).
- **Complete** pays the teacher only when both parties have confirmed (`Transfer`, a negative
  row for the learner and a positive one for the teacher). The learner is not debited again.

Every state change goes through a conditional `updateMany` that also matches on the current
status, so only the caller that actually flips the status moves credits. That is what makes
double-cancel and double-complete safe; a plain `update` would reintroduce the double refund.

The booking price comes from the teacher's `Skill` row when one matches, not from the
client's `creditsPerHour`. The submitted value is only a fallback for a skill with no row,
and is range-checked. Tighten to a hard 400 if every booking should require a real skill.

### Search

Search is **hybrid**: every row is scored on keyword match and on meaning, and ranked on
whichever is higher. Keyword alone misses anything phrased differently; meaning alone is
vague when somebody types an exact skill name.

Meaning comes from an embedding — a 384-number fingerprint, compared with cosine distance.
The model runs locally (`lib/embeddings.js`, `Xenova/all-MiniLM-L6-v2`), downloaded once into
`node_modules`; there is no API key and no per-call cost.

**There are two vector columns, not one**: `Skill.embedding` and `SkillModule.embedding`.
A skill's semantic score is `GREATEST(own vector, best module vector)`. Folding module text
into the skill's own vector was built first, measured, and reverted — averaging a
description together with every module dilutes it, and 6 of 9 test queries scored *lower*
than before modules existed. Keep them separate.

- Embeddings are written with raw SQL. Prisma has no vector type, so the column is
  `Unsupported()` in the schema and invisible to the generated client — **never `SELECT s.*`
  from `Skill`, or `m.*` from `SkillModule`, in a raw query**, or Prisma fails to
  deserialise the vector.
- New skills and new modules are embedded in the background after saving, so a slow model
  never fails the request. `node backfill-embeddings.js` fills in anything missing in *both*
  columns, `--all` redoes everything after a model change.
- The relevance floor (0.36) in `lib/skillSearch.js` was measured, not guessed, and
  re-measured on 19 November 2026 after modules got their own vectors: lowest true match
  0.378, highest false positive 0.300. Re-measure if the model changes **or if what goes
  into either vector changes**.
- The keyword half searches module `title` and `content` too, scored 0.75 like a
  description match.

`GET /api/users/teachers/search` filters and pages **in the database** — `query`, `level`,
`maxRate`, `minRating`, `page`, `limit`, returning `{ results, total, page, hasMore }`. The
page previously fetched a fixed slice and filtered it in the browser, which silently hid
results past the slice. Don't reintroduce client-side filtering; this is the code path
vector search will replace.

Your own listings are excluded server side — you cannot book yourself.

### Roles and the admin routes

Two roles, `user` and `admin`, on `User.role`. `User.status` is `active` or `suspended`.

- **The role is read from the database on every request, never carried in the JWT.** That is
  what makes demotion and suspension take effect at once instead of when a 30-day token
  expires. Do not "optimise" it into the token.
- `middleware/auth.js` exports `requireAdmin`; mount it *after* `auth`, which is what puts the
  role on the request: `router.use(auth, requireAdmin)`.
- `routes/admin.js` (`/api/admin`) — list/search users, suspend and reinstate, promote and
  demote, delete, adjust credits, delete a review, remove a skill listing, cancel a booking.
- **An admin cannot suspend, demote or delete their own account.** Without those guards the
  last admin can lock everyone out of the panel.
- **Credit adjustments go through the same conditional `updateMany` the booking debit uses**,
  so a deduction cannot push a balance negative, and each one writes an `Adjustment`
  Transaction row so the ledger still explains the balance.
- **Deleting a user with bookings is refused (409), not cascaded.** `Booking` restricts the
  foreign key on purpose: removing one party would strand the other's history and credits.
  Suspend instead.

### Redis

A second datastore, `lib/redis.js`, doing two jobs Postgres is a poor fit for:
rate-limiting `/auth/login` (10 attempts per IP+email per 15 minutes, cleared on
success) and caching `/users/teachers/search` for 60 seconds.

- **It fails open on purpose.** No Redis means rate limiting allows everything
  and the cache always misses; the app still works. Never make a request depend
  on Redis being up.
- Keys are prefixed `ratelimit:login:` and `cache:search:`. **Never `FLUSHDB` on
  the dev machine** — the local Redis also holds unrelated keys from another
  exercise.
- The cache is dropped by prefix whenever a teaching skill is added or removed,
  so a new listing shows up immediately instead of after the TTL.
- `scanIterator` in node-redis v5+ yields a *batch* of keys per iteration, not
  one key. `dropPrefix` handles that; copy it rather than rewriting it.
- **Requiring `lib/redis.js` keeps the Node event loop alive**, so a CLI script
  that imports it never exits on its own. Call `client.quit()` at the end.

### Triggers

`review_rating_sync_trigger` on `Review` (AFTER INSERT/UPDATE/DELETE) keeps
`User.rating` and `User.reviewCount` correct via `refresh_user_rating()`.

This used to be JavaScript in both `routes/reviews.js` and `routes/admin.js`.
Both copies are gone — **do not reintroduce rating arithmetic in application
code.** The trigger recomputes with `AVG` rather than adjusting a running total,
so it is self-correcting, and it fires for raw SQL too.

### Demo documentation

`docs/` holds the material for the course evaluation: ER diagram, the
Mongo → relational writeup, the table-to-UI mapping, `crud-operations.sql`
(CRUD on all seven tables), `demo-queries.sql`, the trigger walkthrough, the Redis
guide, and `00-demo-runbook.md` tying them together. Both `.sql` files run clean
end to end against the live database; re-run them after a schema change.

Two rendered diagrams, both regenerated with `npx -y @mermaid-js/mermaid-cli@11`:
`01-er-diagram.png` (from the mermaid block inside `01-er-diagram.md`) and
`schema.png` (from `schema-diagram.mmd`, the physical schema — real Postgres types,
enums, indexes, the procedure and the trigger). **Mermaid rejects `%%` comments that
appear before the diagram keyword**, which is why `schema-diagram.mmd` carries none.

**Anything `crud-operations.sql` updates or deletes must be scoped to `CRUD %` rows.**
Its module titles collide with `demo-seed.sql`'s, so a `WHERE title = ...` with no skill
filter silently edits the demo curriculum instead. That happened once.

`"updatedAt"` must be supplied by hand in raw SQL inserts — Prisma's `@updatedAt`
is applied client-side, not as a database default.

### Checks

`backend/smoke-*.js` — run against a live server. `npm run dev`, then
`cd backend && for f in smoke-*.js; do node $f || break; done`.

`smoke-helpers.js` holds the shared `call`/`newUser`/`cleanup`. `newUser` inserts a user
directly and mints the same JWT the server would issue, rather than registering each fixture
through the API; pass `{ role: 'admin' }` as `extra` for an admin. Each suite deletes its own
`smoke-*@example.com` rows on the way out, pass or fail.

`smoke-admin.js` covers RBAC: every admin route is checked for 401 without a token and 403
with a plain user's token, plus promotion, demotion, suspension taking effect on an existing
token, the self-lockout guards, and that an admin cancel refunds exactly once.

`smoke-redis.js` is the odd one out — it needs neither the server nor Postgres, only a
running `redis-server`. It covers cache read/write/overwrite/TTL, prefix invalidation, and
the rate-limit counter.

## Where things stand

Last worked on: 9 November 2026. The `cleanup-sweep` branch is still unmerged, and the
password-auth/RBAC work described above sits on top of it, uncommitted.

**Done and verified end to end:** the Mongo → Prisma/Postgres migration, email/password
sign-in with bcrypt, two-role RBAC and the admin routes, credit-safe bookings, reviews,
semantic search, the public landing page, the design system rebrand, and booking from a
teacher's profile. All seven smoke suites pass against the live database, and register →
welcome → discover → logout → login was walked through in the browser.

**The database was wiped on 9 November 2026** when password auth replaced Google sign-in —
the three existing accounts had no password and their bookings and reviews hung off them.
A `pg_dump` was taken first. It lives only in that session's scratchpad, so treat the data as
gone. Everything is empty: register a fresh account, then `node make-admin.js <email>`.

### Open, roughly in priority order

1. **Admin content moderation has no UI.** The user panel at `/admin` is built, but
   `DELETE /admin/reviews/:id`, `DELETE /admin/skills/:id` and
   `POST /admin/bookings/:id/cancel` have no screen — they need listing endpoints that
   do not exist yet.
2. **`Transaction` has no read endpoint.** The ledger is written on every credit move and is
   correct, but nothing displays it. Query it directly for now.
3. **Next.js.** Raised as a possible course requirement, then dropped — the frontend is
   still React + Vite. Revisit only if it is confirmed.
4. **Nothing is deployed.** Localhost only, and the frontend proxies `/api` via the Vite dev
   server — that is a dev-only feature and needs replacing with a real API base URL in
   production. Redis would need a hosted instance too.
5. **No password reset, and no email verification.** Anyone who forgets a password needs an
   admin or a database edit. Both need an email sender, which is why they were left out.
6. **The embedding model is small and it shows.** "something about maths" does not find
   Calculus. If misses like that pile up, swap `lib/embeddings.js` for a hosted embedding API —
   it is deliberately one file, and the relevance floor in `lib/skillSearch.js` must be
   re-measured afterwards.
7. **Local branch `sams-branch`** holds one orphan commit ("Create README.md") that was never
   pushed. The README has been rewritten since, so it is almost certainly obsolete.

### Traps worth remembering

These each cost real time once, and none of them produce an error message.

- **Never pass the live database as `--shadow-database-url`.** Prisma resets whatever it is
  given as a shadow database. This wiped the database once.
- **Colour written into a page or component stylesheet beats the theme**, because page styles
  are imported later and specificity ties. This caused four separate "you didn't change it"
  rounds. Colour goes in `styles/theme.css`.
- **`overflow-x: hidden` on `html` or `body` silently disables `position: sticky`** everywhere
  on the page. Use `clip`.
- **Never `SELECT s.*` from `Skill` in a raw query.** The embedding column is a vector and
  Prisma cannot deserialise it.
- **`lib/profile.js` spreads the whole user row into the response.** Adding a secret column
  to `User` leaks it through `/auth/me` and `GET /profile` with no error anywhere. It is
  stripped there now; keep it that way.
- **Test accounts are `smoke-*@example.com` and `uicheck-*@example.com`.** Clean them up —
  an interrupted run once left three fake teachers showing in Discover.
- **`prisma migrate dev` exits 0 without doing anything in a non-interactive shell.** It
  prints the datasource line and stops. Check `prisma migrate status` rather than trusting
  the exit code; the fallback is `migrate diff` + `migrate deploy`.
- **`migrate diff` wants to `DROP INDEX "Skill_embedding_idx"` every time.** Prisma cannot
  see an index on an `Unsupported()` column, so it reads as drift. Strip that line out of
  generated migration SQL — the same applies to `SkillModule_embedding_idx` now.

### Testing

The smoke suites need a live server and hit the real database. `smoke-helpers.js` inserts a
user directly and mints the same JWT the server would.

```
npm run dev
cd backend && for f in smoke-*.js; do node $f || break; done
```

If the database is unreachable, check the network before the code: campus WiFi blocks outbound
5432 and 6543 while leaving 443 open, which looks exactly like a dead project. A phone hotspot
confirms it in seconds.
