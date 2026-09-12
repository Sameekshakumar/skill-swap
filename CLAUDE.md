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

- Auth: **Google sign-in only — the app stores no passwords.** The browser gets an ID token
  from Google and posts it to `POST /api/auth/google`, which verifies it with
  `google-auth-library` and issues our own JWT (24h). `middleware/auth.js` verifies that JWT
  and puts `{ id, email, name, creditBalance }` on `req.user`.
- A Google account is matched by `googleId`, falling back to `email` so an account created
  before Google sign-in is adopted rather than duplicated.
- `GOOGLE_CLIENT_ID` (backend) and `VITE_GOOGLE_CLIENT_ID` (frontend) must match. Both are
  public identifiers, not secrets.
- Validation: `express-validator` `check()` arrays inline in route definitions.
- Routes mounted in `server.js`: `/api/auth`, `/api/bookings`, `/api/users`, `/api/profile`, `/api/reviews`.
  `/api/users` now has exactly one endpoint, `GET /teachers/search` — the CRUD endpoints under it
  were unused and were removed.
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

### Conventions once migrated

- Password hashing is explicit (`bcrypt.hash(password, 10)` at the call site) — the mongoose
  `pre('save')` hook is gone. Any route that sets a password must hash it itself.
- Email/name normalization is explicit too (`trim`/`toLowerCase`) — no schema-level coercion.
- API responses expose `id`, not `_id`, on both the backend and the frontend.
- `/api/auth/me` and `GET /profile` flatten `skillsToLearn` to a string array to match the
  old Mongo shape.

### UI structure

- `components/layout/Layout.tsx` renders `Navbar` + `<Outlet/>` and wraps every signed-in
  route. Pages must **not** draw their own header nav — they did, which is why "My Sessions"
  vanished on the discover page.
- **`styles/ppi-ui.css` owns the palette** (ported from `ui-kit/`, adapted to `data-theme`).
  `styles/theme.css` is the only bridge, mapping the app's own variable names onto its tokens.
  Page stylesheets must declare neither `:root` variables nor raw hex — three of them did,
  which broke dark mode. `ThemeContext` sets the attribute and persists the choice.
- **Nothing above the ambient layer may be opaque.** `AmbientBackground` is fixed at
  `z-index: -10`; `<body>` paints the ground. An opaque page wrapper hides the blobs
  completely, with no error — the single easiest way to break the look.
- Headings use `--ppi-font-display` (Playfair Display, loaded in `index.html`); body copy
  stays sans. Panels use the one glass recipe listed in `theme.css`, never a flat fill.
- Icons should use the `.ppi-icon` mask so one black PNG serves both themes and any colour.
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

`GET /api/users/teachers/search` filters and pages **in the database** — `query`, `level`,
`maxRate`, `minRating`, `page`, `limit`, returning `{ results, total, page, hasMore }`. The
page previously fetched a fixed slice and filtered it in the browser, which silently hid
results past the slice. Don't reintroduce client-side filtering; this is the code path
vector search will replace.

Your own listings are excluded server side — you cannot book yourself.

### Checks

`backend/smoke-*.js` — run against a live server. `npm run dev`, then
`cd backend && for f in smoke-*.js; do node $f || break; done`.

`smoke-helpers.js` holds the shared `call`/`newUser`/`cleanup`. Tests cannot sign in through
Google, so `newUser` inserts a user directly and mints the same JWT the server would issue.
Each suite deletes its own `smoke-*@example.com` rows on the way out, pass or fail.
