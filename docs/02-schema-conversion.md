# From documents to a relational schema

This project did not start relational. The first version stored everything in
MongoDB through Mongoose. This is what changed and why.

## The starting point

Mongo held one `users` collection. A user document carried its own data *and*
nested arrays of everything related to it:

```js
// roughly the old shape
{
  _id: ObjectId("..."),
  email: "a@example.com",
  password: "$2b$10$...",
  creditBalance: 10,
  skillsToTeach: [                       // array of subdocuments
    { skillName: "Calculus", level: "Advanced", creditsPerHour: 2 }
  ],
  skillsToLearn: ["Guitar", "French"]    // array of plain strings
}
```

Bookings and reviews lived in their own collections but referred to users by
`ObjectId` with no constraint behind the reference.

## What was wrong with it

- **No referential integrity.** A booking could name a `teacherId` that had been
  deleted. Nothing stopped it, and nothing told you afterwards.
- **Skills could not be searched or joined.** Finding everyone who teaches
  Calculus meant scanning every user document and walking a nested array.
- **Credits had no audit trail.** `creditBalance` was a number that got
  overwritten. If it went wrong there was no way to see how.
- **Concurrency was unguarded.** Reading a balance, subtracting in JavaScript,
  then writing it back loses one of two simultaneous bookings.

## The conversion, step by step

### 1. Nested arrays became their own tables

A repeating group inside a row is the thing first normal form forbids, so each
array became a table with a foreign key pointing back.

| Mongo | Postgres | Why |
|-------|----------|-----|
| `user.skillsToTeach[]` (subdocuments) | `Skill` table, FK `userId` | Each entry had its own attributes (level, rate, description), so it is an entity in its own right. |
| `user.skillsToLearn[]` (strings) | `SkillToLearn` table, FK `userId` | Only a name, but still a repeating group. `UNIQUE(userId, skillName)` now enforces what application code used to check with `includes()`. |

### 2. References became real foreign keys

Every `ObjectId` reference became a `FOREIGN KEY` with an explicit delete rule,
chosen per relationship rather than globally:

- `Skill.userId`, `SkillToLearn.userId`, `Transaction.userId`, `Review.reviewerId`,
  `Review.revieweeId` → **CASCADE**. These have no meaning without their user.
- `Booking.skillId` → **SET NULL**. The booking keeps a copy of the skill name,
  so removing a listing must not remove the history.
- `Booking.teacherId`, `Booking.learnerId` → **RESTRICT**. Deleting a participant
  would strand the other side of a session.

### 3. Free-text status fields became enums

`status: "confirmed"` was a string that could hold anything, including
`"Confirmed"` and `"CONFIRMED"` in the same collection. Each became a Postgres
enum: `BookingStatus`, `SkillLevel`, `TransactionType`, `BookingParty`, and later
`Role` and `UserStatus`.

### 4. Credits became a ledger

The single mutable `creditBalance` gained a `Transaction` table beside it. The
balance is still a column — it is read on nearly every page — but every change
also writes a signed row (`Lock`, `Transfer`, `Refund`, `Adjustment`), so the
history explains the number.

The update itself was rewritten to be safe under concurrency. Instead of reading
the balance and writing it back:

```sql
UPDATE "User"
SET "creditBalance" = "creditBalance" - $1
WHERE id = $2 AND "creditBalance" >= $1;   -- 0 rows affected = not enough credits
```

The check and the write are one statement, so two simultaneous bookings cannot
both pass the balance check.

### 5. Derived values moved into the database

`User.rating` and `User.reviewCount` are computed from the `Review` table. They
were recalculated in JavaScript at two call sites. They are now maintained by the
`review_rating_sync` trigger — see [04-trigger.md](04-trigger.md).

## Normal form

All six tables are in **3NF**.

- **1NF** — no repeating groups; the two arrays became tables (step 1). Every
  column holds a single value.
- **2NF** — every table has a single-column UUID primary key, so no non-key
  column can depend on part of a key.
- **3NF** — no non-key column depends on another non-key column.

Two deliberate denormalisations, both for good reasons:

| Column | Why it is duplicated |
|--------|---------------------|
| `Booking.skill` | A copy of the skill name at booking time. The listing can be deleted or renamed later; the session record should still say what was taught. |
| `User.rating`, `User.reviewCount` | Derived from `Review`, but recomputing an average on every search result would be expensive. Kept correct by a trigger rather than by hope. |

Both are recoverable from other tables, which is the test of a *safe*
denormalisation: if they ever drift, they can be rebuilt.

## What the migration actually looked like

Three migrations, in `backend/prisma/migrations/`:

1. `20260911121034_init` — the six tables, enums, foreign keys and indexes.
2. `20260912161348_google_auth` — identity columns (since replaced by password auth).
3. `20260913132640_skill_embeddings` — `pgvector`, the `Skill.embedding` column
   and an HNSW index for semantic search.

Later: `20261109055719_password_auth_and_rbac` (passwords, roles, suspension) and
`20261117090000_review_rating_trigger` (the trigger).
