# skill-swap

Credit-based peer-to-peer skill exchange. Students list skills to teach/learn, book sessions, pay in credits, leave reviews.

## Layout

```
backend/    Express API (server.js, routes/, middleware/, lib/, prisma/)
frontend/   React 18 + TS + Vite + Tailwind 4
src/pages/  LEFTOVER from the pre-split layout — see MIGRATION_GUIDE.md
public/     LEFTOVER, same
```

Root `package.json` is scripts only (`concurrently`).

## Run

```
npm run install-all   # root + backend + frontend
npm run dev           # backend :5001 + frontend :3000
```

Frontend calls relative `/api`; Vite proxies to `localhost:5001` (`frontend/vite.config.js`). No `VITE_API_URL`.

## Backend

- Auth: JWT in `Authorization: Bearer <token>`, signed in `routes/auth.js`, verified in
  `middleware/auth.js` which puts `{ id, email, name, creditBalance }` on `req.user`. 24h expiry.
- Passwords: bcrypt, hashed explicitly at the call site.
- Validation: `express-validator` `check()` arrays inline in route definitions.
- Routes mounted in `server.js`: `/api/auth`, `/api/bookings`, `/api/users`, `/api/profile`, `/api/reviews`.
- Models live in `prisma/schema.prisma`: `User`, `Skill`, `SkillToLearn`, `Booking`,
  `Transaction`, `Review`. `creditBalance` defaults to 10.
- `lib/httpError.js` — throw `HttpError(status, message)` inside a `$transaction` to roll it
  back with a real status code; `sendError(res, err, fallback)` in the catch.
- `lib/profile.js` — the shared "user minus password, with both skill lists" shape.

## Frontend

- `src/utils/axios.ts` — the shared axios instance. Attaches the JWT from `localStorage` via interceptor. Use it, don't call axios directly.
- `src/contexts/AuthContext.tsx` — auth state.
- Mixed `.tsx` + per-page plain `.css` files. No CSS modules.

## Env

`backend/.env` is the one the server actually loads — `dotenv` resolves it from the backend
working directory, not the repo root. Keys: `DATABASE_URL`, `JWT_SECRET`, `PORT`.
Both `.env` files are gitignored — never commit them.

## Postgres migration (branch `postgres-migration`)

**Backend migration is complete.** Prisma 6 + Supabase Postgres. Prisma 7 is **not** usable here without extra
wiring (it dropped `url` from `datasource` and needs a driver adapter) — both deps are pinned `^6`.

All five route files, the auth middleware, and `server.js` are on Prisma. `mongoose` is
uninstalled and `backend/models/` is deleted — the schema lives in `prisma/schema.prisma` now.

The frontend reads `id` throughout; the migration is finished end to end.

### Migration workflow

```
cd backend
npx prisma migrate dev --name <name>
```

This needs the **session pooler** URL. It does not work over the direct
`db.<ref>.supabase.co` host — see below.

### Supabase connection

Use the session pooler URI (Dashboard → Connect → Session mode), currently
`aws-0-ap-northeast-2.pooler.supabase.com:5432` with the `postgres.<project-ref>` username.

Do not switch to the direct `db.<ref>.supabase.co` host. It has no A record, and Prisma's
engine will not resolve an AAAA-only host — it fails `P1001` even though plain TCP to that
host works. The pooler also fixes `migrate dev`, which could not create its shadow database
over the direct connection.

### Conventions once migrated

- Password hashing is explicit (`bcrypt.hash(password, 10)` at the call site) — the mongoose
  `pre('save')` hook is gone. Any route that sets a password must hash it itself.
- Email/name normalization is explicit too (`trim`/`toLowerCase`) — no schema-level coercion.
- API responses expose `id`, not `_id`, on both the backend and the frontend.
- `/api/auth/me` and `GET /profile` flatten `skillsToLearn` to a string array to match the
  old Mongo shape.

### Known pre-existing bugs (not from the migration)

- `components/ProtectedRoute.tsx` redirects on `!isAuthenticated` with no loading state, but
  `AuthContext` restores the session by fetching `/profile` asynchronously. Any hard refresh
  of `/profile` or `/dashboard` bounces to `/login` before that resolves. Fix: a `loading`
  flag in `AuthContext` that `ProtectedRoute` waits on.
- `DashboardPage.tsx` uses `window.alert` / `window.confirm` for every action result. They
  block the page and make browser automation hang.
- `AuthContext.tsx:48` — implicit `any` on the axios `.then` callback. The only error under
  `tsc --strict`; the project has no `tsconfig.json`, so nothing typechecks on build.

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

### Checks

`backend/smoke-*.js` — run against a live server. `npm run dev`, then
`cd backend && for f in smoke-*.js; do node $f || break; done`. They create `smoke-*@example.com`
users; clear them with a `deleteMany` on that email prefix.
