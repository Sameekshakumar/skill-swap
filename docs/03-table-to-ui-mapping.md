# Which table shows up where

Each row traces one table from the database, through the API route that reads it,
to the screen that displays it.

| Table | API endpoint | Backend file | Frontend page | What you see |
|-------|-------------|--------------|---------------|--------------|
| `User` | `GET /api/admin/users` | `routes/admin.js` | `/admin` — `AdminPage.tsx` | The full account table: name, email, role, status, credits |
| `User` | `GET /api/profile` | `routes/profile.js` | `/profile` — `ProfilePage.tsx` | Your own name, college, year, bio |
| `User` | `POST /api/auth/login` | `routes/auth.js` | `/login` — `LoginPage.tsx` | Sign-in; reads `passwordHash`, `role`, `status` |
| `User.creditBalance` | `GET /api/profile` | `routes/profile.js` | Navbar — `Navbar.tsx` | The credit pill, top right |
| `Skill` | `GET /api/users/teachers/search` | `routes/users.js` | `/discover` — `SearchPage.tsx` | Every teacher card in the search results |
| `Skill` | `POST /api/profile/skills/teach` | `routes/profile.js` | `/profile` | "Skills I Can Teach" |
| `SkillModule` | `POST /api/profile/skills/teach/:skillId/modules` | `routes/profile.js` | `/profile` | The curriculum editor under each teaching skill |
| `SkillModule` | `GET /api/users/:id` | `routes/users.js` | `/teachers/:id` — `TeacherProfilePage.tsx` | "What this covers" — the numbered module list |
| `SkillModule` (count) | `GET /api/users/teachers/search` | `routes/users.js` | `/discover` | "N modules in the curriculum" on a teacher card |
| `SkillToLearn` | `POST /api/profile/skills/learn` | `routes/profile.js` | `/profile` | "Skills I Want to Learn" |
| `Booking` | `GET /api/bookings` | `routes/bookings.js` | `/dashboard` — `DashboardPage.tsx` | "My Sessions" |
| `Booking` | `GET /api/bookings/requests` | `routes/bookings.js` | `/dashboard` | Incoming requests awaiting accept/reject |
| `Booking` | `POST /api/bookings` | `routes/bookings.js` | `/teachers/:id` — `TeacherProfilePage.tsx` | The booking form on a teacher's profile |
| `Transaction` | *(no read endpoint)* | — | — | Written on every credit move; visible only in SQL today |
| `Review` | `GET /api/reviews/user/:userId` | `routes/reviews.js` | `/teachers/:id` | The review list on a teacher's profile |
| `Review` | `POST /api/reviews` | `routes/reviews.js` | `/dashboard` | "Leave a review" on a completed session |
| `User.rating` (from `Review`) | `GET /api/users/teachers/search` | `routes/users.js` | `/discover` | The star rating on each teacher card |

## Two honest gaps

**`Transaction` has no read endpoint.** Every credit movement writes a row and the
ledger is correct, but no screen displays it. To show it in the demo, query it
directly — `docs/demo-queries.sql` has the statement ready. Adding a "credit
history" panel would be a small job if it is asked for.

**Admin content moderation has endpoints but no UI.** `DELETE /api/admin/reviews/:id`,
`DELETE /api/admin/skills/:id` and `POST /api/admin/bookings/:id/cancel` all work
and are covered by `smoke-admin.js`, but the admin page only manages users. The
others need a listing screen that does not exist yet.

## The path of one request

Worth being able to narrate. Searching for "Calculus" on `/discover`:

```
SearchPage.tsx
  -> utils/axios.ts          attaches the JWT from localStorage
  -> GET /api/users/teachers/search?query=Calculus
  -> middleware/auth.js      verifies the JWT, re-reads the user, checks status
  -> routes/users.js         checks the Redis cache first
       hit  -> returns the cached JSON, header X-Cache: HIT
       miss -> lib/skillSearch.js
                 lib/embeddings.js turns "Calculus" into 384 numbers
                 one SQL query scores every Skill on keyword AND meaning
                 joins Skill -> User for the teacher's name and rating
            -> caches the result for 60 seconds, header X-Cache: MISS
  -> SearchPage.tsx renders one card per row
```

The same journey touches both databases: Postgres for the data, Redis for the
cache in front of it.
