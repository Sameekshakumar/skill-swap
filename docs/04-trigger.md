# The trigger: showing data before and after

Requirement 7. Migration: `backend/prisma/migrations/20261117090000_review_rating_trigger/`.

## What it does

`User.rating` and `User.reviewCount` are derived from the `Review` table. The
trigger keeps them correct whenever a review is inserted, updated or deleted.

Two database objects:

| Object | Kind | Job |
|--------|------|-----|
| `refresh_user_rating(target_id TEXT)` | function | Recomputes one user's average and count from `Review` |
| `review_rating_sync()` | trigger function | Works out which user is affected, calls the above |
| `review_rating_sync_trigger` | trigger | `AFTER INSERT OR UPDATE OR DELETE ON "Review" FOR EACH ROW` |

## Why it exists

This was previously done in JavaScript, at two different call sites — once when
a review was created (`routes/reviews.js`) and once when an admin deleted one
(`routes/admin.js`). Two copies of the same arithmetic, and any third way of
touching the table would have missed it entirely.

Now the database owns it. A review inserted by hand in `psql` updates the rating
just as surely as one submitted through the app — which is exactly what makes it
demonstrable.

## The demo

Run these in order. Replace the email if you are using a different account.

### Step 1 — before

```sql
SELECT name, rating, "reviewCount"
FROM "User" WHERE email = 'crud-alice@example.com';
```

```
    name     | rating | reviewCount
-------------+--------+-------------
 CRUD Alice  |      0 |           0
```

### Step 2 — insert a review, touching only the Review table

```sql
INSERT INTO "Review" (id, "reviewerId", "revieweeId", "bookingId", rating, comment, skill, "updatedAt")
SELECT gen_random_uuid(), b."learnerId", b."teacherId", b.id, 5,
       'Very clear explanations', b.skill, NOW()
FROM "Booking" b WHERE b.skill = 'CRUD Calculus';
```

Note that the statement never mentions `"User"`.

### Step 3 — after

```sql
SELECT name, rating, "reviewCount"
FROM "User" WHERE email = 'crud-alice@example.com';
```

```
    name     | rating | reviewCount
-------------+--------+-------------
 CRUD Alice  |      5 |           1
```

The rating changed without anyone updating `"User"`. The trigger did it.

### Step 4 — a second review shows it averages rather than overwrites

```sql
-- a 3-star review from a different booking
SELECT name, rating, "reviewCount" FROM "User" WHERE email = 'crud-alice@example.com';
-- rating becomes 4.0, reviewCount becomes 2
```

### Step 5 — delete, and watch it reverse

```sql
DELETE FROM "Review" WHERE comment = 'Very clear explanations';

SELECT name, rating, "reviewCount" FROM "User" WHERE email = 'crud-alice@example.com';
```

Count drops and the average is recomputed from what remains. Delete every review
and the rating returns to `0`, not `NULL` — the column is `NOT NULL` and the UI
reads `0` as "not rated yet".

## Proving the trigger exists

```sql
SELECT trigger_name, event_object_table, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public';
```

Three rows — one each for INSERT, UPDATE and DELETE.

To show the source:

```sql
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname IN ('refresh_user_rating', 'review_rating_sync');
```

## Points worth making if asked

**Why `AFTER` and not `BEFORE`?** The function reads the `Review` table to compute
an average. On a `BEFORE INSERT` the new row is not in the table yet, so the
average would be computed without it.

**Why does it return `NULL`?** An `AFTER` trigger's return value is ignored, and
`NULL` is the conventional way of saying so.

**Why handle `OLD` and `NEW` separately?** `DELETE` has no `NEW` row and `INSERT`
has no `OLD` row, so referencing the wrong one errors. And if an `UPDATE` moved a
review to a different reviewee, *both* people need recomputing — the one who lost
the review and the one who gained it.

**Why recompute from scratch instead of adjusting?** Adding to a running total is
faster, but it drifts: one missed event and the number is wrong forever with no
way to notice. Recomputing with `AVG` is self-correcting — it is right regardless
of what happened before.

**Does the application still do the maths?** No. Both JavaScript copies were
deleted when the trigger was added. There is exactly one implementation.
