# Skill Swap

A credit-based skill exchange for students. Teach somebody something for an hour and you
earn credits; spend those credits to learn something yourself. No money is involved, and
nobody can take a lesson they have not earned.

## How it works

1. **List what you teach.** A skill, its level, a short description, and what an hour of it
   is worth — between one and three credits. You can also list what you want to learn.
2. **Request a session.** Browse what other students teach and ask for a time. Your credits
   are set aside the moment you ask, so a session can never be booked without the credits to
   cover it.
3. **Both confirm.** After the session you each mark it complete. Only when both of you agree
   do the credits reach the teacher. Then you can review each other.

Everyone starts with 10 credits. Declining or cancelling a request refunds them in full.

## Tech

**Backend** — Node.js, Express, Prisma 6, PostgreSQL (hosted on Supabase).
Sign-in is Google only, verified server-side with `google-auth-library`; the app issues its
own JWT and stores no passwords.

**Frontend** — React 18, TypeScript, Vite, React Router. Plain CSS, no UI framework.

## Layout

```
backend/
  routes/        auth, profile, users, bookings, reviews
  middleware/    JWT verification
  lib/           Prisma client, shared profile shape, HTTP errors
  prisma/        schema and migrations
  smoke-*.js     end-to-end checks against a running server
frontend/
  src/pages/     landing, login, welcome, discover, sessions, profile, teacher profile
  src/components/
  src/contexts/  auth, theme, in-page feedback
  src/styles/    design system and the bridge onto it
```

## Running it

```bash
npm run install-all     # root, backend and frontend
npm run dev             # backend on :5001, frontend on :3000
```

Open <http://localhost:3000>.

### Environment

`backend/.env` — **not** the repo root; `dotenv` resolves it from the backend directory.

```env
DATABASE_URL=postgresql://...        # Supabase session pooler connection string
JWT_SECRET=...                       # any long random string
PORT=5001
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
```

`frontend/.env`

```env
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com   # must match the backend
```

Both `.env` files are gitignored. The Google client ID is a public identifier, not a secret,
and this sign-in method needs no client secret at all.

### Google sign-in setup

In the [Google Cloud console](https://console.cloud.google.com/): create a project, complete
the Google Auth Platform setup, then create an OAuth **Web application** client with
`http://localhost:3000` as an authorised JavaScript origin. Leave the redirect URIs empty —
this flow does not use them. Copy the client ID into both `.env` files.

While the app is unpublished, only accounts listed under **Audience → Test users** can sign
in. Publishing lifts that, and needs no review for the basic profile and email scopes.

### Database

The schema lives in `backend/prisma/schema.prisma`.

```bash
cd backend
npx prisma migrate dev --name <name>   # create and apply a migration
npx prisma studio                      # browse the data
```

Use the Supabase **session pooler** connection string. The direct `db.<ref>.supabase.co`
host has no IPv4 address, and Prisma's engine will not resolve an IPv6-only host — it fails
with `P1001` even though the host is reachable.

Never pass the live database as `--shadow-database-url`. Prisma resets whatever it is given
as a shadow database.

## API

All routes are under `/api`. Everything except `POST /auth/google` requires
`Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/google` | Exchange a Google credential for an app token |
| GET | `/auth/me` | The signed-in user |
| GET | `/profile` | Own profile, with both skill lists |
| PUT | `/profile` | Update name, college, year, bio |
| POST | `/profile/skills/teach` | Add a teaching skill |
| DELETE | `/profile/skills/teach/:skillId` | Remove one |
| POST | `/profile/skills/learn` | Add a skill you want to learn |
| DELETE | `/profile/skills/learn/:skillName` | Remove one |
| GET | `/users/teachers/search` | Search teachers — `query`, `level`, `maxRate`, `minRating`, `page`, `limit` |
| GET | `/users/:id` | A teacher's public profile |
| GET | `/bookings` | Everything you are part of |
| POST | `/bookings` | Request a session |
| POST | `/bookings/:id/accept` | Teacher accepts |
| POST | `/bookings/:id/reject` | Teacher declines, credits refunded |
| POST | `/bookings/:id/cancel` | Learner cancels, credits refunded |
| POST | `/bookings/:id/complete` | Mark complete; credits move once both have |
| GET | `/bookings/requests`, `/my-requests`, `/upcoming`, `/completed` | Filtered views |
| POST | `/reviews` | Review the other person in a completed session |
| GET | `/reviews/user/:userId`, `/received`, `/my-reviews`, `/pending` | Review lists |

## Credits

Every movement runs inside a database transaction:

- **Requesting** debits the learner immediately and records a `Lock`.
- **Declining, cancelling or resetting** refunds them.
- **Completing** pays the teacher, but only once both sides confirm.

Each state change is a conditional update that also matches on the current status, so only
the caller that actually changes the status moves any credits. That is what stops a double
refund or a double payout.

A booking's price always comes from the teacher's own skill record, never from the request
body.

## Tests

`backend/smoke-*.js` run against a live server and cover the real database.

```bash
npm run dev
cd backend && for f in smoke-*.js; do node $f || break; done
```

They create and clean up their own `smoke-*@example.com` accounts. Sign-in cannot be scripted
through Google, so the helpers insert a user directly and mint the same token the server
would issue — every route behind the token is still exercised.

## Notes

- The frontend proxies `/api` to the backend in development (`frontend/vite.config.js`);
  it is a dev-server feature and will not apply to a production build.
- `frontend/npm run build` typechecks before building.
