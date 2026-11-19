-- ===========================================================================
-- CRUD on every table. Requirement 5.
--
-- Connect:
--   cd backend
--   PGPASSWORD='<db password>' psql "postgresql://postgres.<project-ref>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"
--
-- Table names are quoted because Prisma created them with capital letters.
-- Unquoted, Postgres folds identifiers to lowercase and "User" becomes "user",
-- which does not exist. Every statement below keeps the quotes.
--
-- Seven tables, in dependency order: User, Skill, SkillModule, SkillToLearn,
-- Booking, Transaction, Review.
--
-- Rows created here use the crud-* prefix, kept separate from demo-seed.sql's
-- demo-* rows so this script's UPDATEs and DELETEs cannot touch them.
-- The teardown at the bottom deletes all of them.
--
-- "updatedAt" is set by hand on every INSERT. Prisma's @updatedAt is applied by
-- the client, not by a database default, so a raw INSERT that omits the column
-- fails with a NOT NULL violation. (SkillToLearn has no updatedAt column.)
-- ===========================================================================


-- ===========================================================================
-- 0. Clean slate
-- ---------------------------------------------------------------------------
-- Makes the script re-runnable. Without this, a second run (or a first run
-- interrupted halfway) fails on the unique email constraint. Children first:
-- Booking -> User is RESTRICT.
-- ===========================================================================

DELETE FROM "Review"       WHERE skill LIKE 'CRUD %';
DELETE FROM "Transaction"  WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'crud-%@example.com');
DELETE FROM "Booking"      WHERE skill LIKE 'CRUD %';
DELETE FROM "SkillToLearn" WHERE "skillName" LIKE 'CRUD %';
DELETE FROM "SkillModule"  WHERE "skillId" IN (SELECT id FROM "Skill" WHERE "skillName" LIKE 'CRUD %');
DELETE FROM "Skill"        WHERE "skillName" LIKE 'CRUD %';
DELETE FROM "User"         WHERE email LIKE 'crud-%@example.com';


-- ===========================================================================
-- 1. User
-- ===========================================================================

-- CREATE
INSERT INTO "User" (id, email, name, "passwordHash", role, status, college, "yearOfStudy", "creditBalance", "updatedAt")
VALUES (gen_random_uuid(), 'crud-alice@example.com', 'CRUD Alice',
        '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRS',
        'user', 'active', 'PES University', '3rd Year', 10, NOW());

INSERT INTO "User" (id, email, name, "passwordHash", role, status, college, "yearOfStudy", "creditBalance", "updatedAt")
VALUES (gen_random_uuid(), 'crud-bob@example.com', 'CRUD Bob',
        '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRS',
        'user', 'active', 'PES University', '2nd Year', 10, NOW());

-- READ
SELECT id, email, name, role, status, "creditBalance", rating, "reviewCount"
FROM "User"
ORDER BY "createdAt" DESC;

-- READ: how many users, and how many of each role (requirement 1)
SELECT role, COUNT(*) AS users FROM "User" GROUP BY role ORDER BY role;
SELECT COUNT(*) AS total_users FROM "User";

-- UPDATE
UPDATE "User" SET college = 'PES University RR Campus', bio = 'Updated in the demo'
WHERE email = 'crud-alice@example.com';

-- UPDATE: promote to admin (the same thing make-admin.js does)
UPDATE "User" SET role = 'admin' WHERE email = 'crud-alice@example.com';

-- UPDATE: suspend an account
UPDATE "User" SET status = 'suspended' WHERE email = 'crud-bob@example.com';
UPDATE "User" SET status = 'active'    WHERE email = 'crud-bob@example.com';

-- DELETE  (at the bottom, so later sections can use these rows)


-- ===========================================================================
-- 2. Skill
-- ===========================================================================

-- CREATE
INSERT INTO "Skill" (id, "userId", "skillName", description, level, "creditsPerHour", "updatedAt")
SELECT gen_random_uuid(), id, 'CRUD Calculus', 'Limits, derivatives and integrals', 'Advanced', 2, NOW()
FROM "User" WHERE email = 'crud-alice@example.com';

INSERT INTO "Skill" (id, "userId", "skillName", description, level, "creditsPerHour", "updatedAt")
SELECT gen_random_uuid(), id, 'CRUD Guitar', 'Chords and strumming for beginners', 'Beginner', 1, NOW()
FROM "User" WHERE email = 'crud-alice@example.com';

-- READ  (never SELECT * here: the embedding column is a vector and the Prisma
--        client cannot deserialise it. Naming columns avoids the problem.)
SELECT s.id, s."skillName", s.level, s."creditsPerHour", u.name AS teacher
FROM "Skill" s
JOIN "User" u ON u.id = s."userId"
ORDER BY s."createdAt" DESC;

-- UPDATE
UPDATE "Skill" SET "creditsPerHour" = 3, level = 'Expert'
WHERE "skillName" = 'CRUD Calculus';

-- DELETE
DELETE FROM "Skill" WHERE "skillName" = 'CRUD Guitar';


-- ===========================================================================
-- 3. SkillModule
-- ---------------------------------------------------------------------------
-- The curriculum of a skill: one row per module, ordered by "position".
-- Modules hang off "Skill", not off "User", so this is the only table that is
-- two levels down — reading a teacher's curriculum is a three-table join.
-- ===========================================================================

-- CREATE  (attached to CRUD Calculus; CRUD Guitar was deleted above, and its
--          modules would have gone with it — the FK is ON DELETE CASCADE.)
INSERT INTO "SkillModule" (id, "skillId", title, content, "position", "updatedAt")
SELECT gen_random_uuid(), s.id, 'Limits and continuity',
       'One-sided limits and spotting where a function breaks.', 0, NOW()
FROM "Skill" s WHERE s."skillName" = 'CRUD Calculus';

INSERT INTO "SkillModule" (id, "skillId", title, content, "position", "updatedAt")
SELECT gen_random_uuid(), s.id, 'Differentiation',
       'Power, product, quotient and chain rules.', 1, NOW()
FROM "Skill" s WHERE s."skillName" = 'CRUD Calculus';

-- READ  (same rule as "Skill": never SELECT m.* — "SkillModule"."embedding"
--        is a vector and the Prisma client cannot deserialise it.)
SELECT m."position", m.title, m.content, s."skillName", u.name AS teacher
FROM "SkillModule" m
JOIN "Skill" s ON s.id = m."skillId"
JOIN "User"  u ON u.id = s."userId"
WHERE s."skillName" LIKE 'CRUD %'
ORDER BY s."skillName", m."position";

-- How many modules each skill is broken into — this is the count the search
-- cards show.
SELECT s."skillName", COUNT(m.id) AS modules
FROM "Skill" s
LEFT JOIN "SkillModule" m ON m."skillId" = s.id
WHERE s."skillName" LIKE 'CRUD %'
GROUP BY s."skillName";

-- UPDATE  (scoped to this script's own skill. Matching on title alone would
--          also hit demo-seed.sql's curriculum, which reuses these titles.)
UPDATE "SkillModule" SET content = 'Epsilon-delta intuition and one-sided limits.'
WHERE title = 'Limits and continuity'
  AND "skillId" IN (SELECT id FROM "Skill" WHERE "skillName" LIKE 'CRUD %');

-- DELETE  (same scoping, same reason)
DELETE FROM "SkillModule"
WHERE title = 'Differentiation'
  AND "skillId" IN (SELECT id FROM "Skill" WHERE "skillName" LIKE 'CRUD %');


-- ===========================================================================
-- 4. SkillToLearn
-- ===========================================================================

-- CREATE
INSERT INTO "SkillToLearn" (id, "userId", "skillName")
SELECT gen_random_uuid(), id, 'CRUD Photography'
FROM "User" WHERE email = 'crud-bob@example.com';

-- READ
SELECT l.id, l."skillName", u.name AS learner
FROM "SkillToLearn" l
JOIN "User" u ON u.id = l."userId"
ORDER BY l."createdAt" DESC;

-- UPDATE
UPDATE "SkillToLearn" SET "skillName" = 'CRUD Film Photography'
WHERE "skillName" = 'CRUD Photography';

-- DELETE
DELETE FROM "SkillToLearn" WHERE "skillName" = 'CRUD Film Photography';


-- ===========================================================================
-- 5. Booking
-- ===========================================================================

-- CREATE  (Alice teaches, Bob learns)
INSERT INTO "Booking" (id, "teacherId", "learnerId", "skillId", skill, status,
                       "creditAmount", "dateTime", duration, notes, "updatedAt")
SELECT gen_random_uuid(), t.id, l.id, s.id, s."skillName", 'Requested',
       s."creditsPerHour" * 1, NOW() + INTERVAL '3 days', 1, 'Created by the demo script', NOW()
FROM "User" t
JOIN "Skill" s ON s."userId" = t.id AND s."skillName" = 'CRUD Calculus'
CROSS JOIN "User" l
WHERE t.email = 'crud-alice@example.com' AND l.email = 'crud-bob@example.com';

-- READ
SELECT b.id, b.skill, b.status, b."creditAmount", b."dateTime",
       t.name AS teacher, l.name AS learner
FROM "Booking" b
JOIN "User" t ON t.id = b."teacherId"
JOIN "User" l ON l.id = b."learnerId"
ORDER BY b."createdAt" DESC;

-- UPDATE: accept, then mark complete by both sides
UPDATE "Booking" SET status = 'Confirmed', "updatedAt" = NOW()
WHERE skill = 'CRUD Calculus' AND status = 'Requested';

UPDATE "Booking" SET "completedByTeacher" = TRUE, "completedByLearner" = TRUE,
                     status = 'Completed', "updatedAt" = NOW()
WHERE skill = 'CRUD Calculus' AND status = 'Confirmed';

-- DELETE  (at the bottom — Review and Transaction reference this row)


-- ===========================================================================
-- 6. Transaction
-- ===========================================================================

-- CREATE: the learner's credits are locked when they request a session
INSERT INTO "Transaction" (id, "userId", "bookingId", type, amount, description, "updatedAt")
SELECT gen_random_uuid(), b."learnerId", b.id, 'Lock', -b."creditAmount",
       'Locked credits for the demo session', NOW()
FROM "Booking" b WHERE b.skill = 'CRUD Calculus';

-- CREATE: an admin adjustment, which belongs to no booking
INSERT INTO "Transaction" (id, "userId", "bookingId", type, amount, description, "updatedAt")
SELECT gen_random_uuid(), id, NULL, 'Adjustment', 5, 'CRUD goodwill credit', NOW()
FROM "User" WHERE email = 'crud-bob@example.com';

-- READ: one person's ledger, newest first
SELECT tr.type, tr.amount, tr.description, tr."createdAt", u.name
FROM "Transaction" tr
JOIN "User" u ON u.id = tr."userId"
WHERE u.email = 'crud-bob@example.com'
ORDER BY tr."createdAt" DESC;

-- READ: does the ledger agree with the balance?
SELECT u.name, u."creditBalance", COALESCE(SUM(tr.amount), 0) AS ledger_sum
FROM "User" u
LEFT JOIN "Transaction" tr ON tr."userId" = u.id
GROUP BY u.id, u.name, u."creditBalance";

-- UPDATE
UPDATE "Transaction" SET description = 'CRUD goodwill credit (corrected)'
WHERE description = 'CRUD goodwill credit';

-- DELETE
DELETE FROM "Transaction" WHERE description = 'CRUD goodwill credit (corrected)';


-- ===========================================================================
-- 7. Review
-- ===========================================================================
-- Inserting here fires the review_rating_sync trigger, which rewrites the
-- reviewee's rating and reviewCount. See docs/04-trigger.md.

-- BEFORE
SELECT name, rating, "reviewCount" FROM "User" WHERE email = 'crud-alice@example.com';

-- CREATE  (Bob reviews Alice for the completed session)
INSERT INTO "Review" (id, "reviewerId", "revieweeId", "bookingId", rating, comment, skill, "updatedAt")
SELECT gen_random_uuid(), b."learnerId", b."teacherId", b.id, 5,
       'Very clear explanations', b.skill, NOW()
FROM "Booking" b WHERE b.skill = 'CRUD Calculus';

-- AFTER: rating 0 -> 5, reviewCount 0 -> 1, written by the trigger
SELECT name, rating, "reviewCount" FROM "User" WHERE email = 'crud-alice@example.com';

-- READ
SELECT r.rating, r.comment, r.skill,
       reviewer.name AS written_by, reviewee.name AS about
FROM "Review" r
JOIN "User" reviewer ON reviewer.id = r."reviewerId"
JOIN "User" reviewee ON reviewee.id = r."revieweeId"
ORDER BY r."createdAt" DESC;

-- UPDATE: the trigger fires again and recomputes the average
UPDATE "Review" SET rating = 3, comment = 'Rewritten by the demo'
WHERE comment = 'Very clear explanations';

SELECT name, rating, "reviewCount" FROM "User" WHERE email = 'crud-alice@example.com';

-- DELETE: back to 0 reviews, so the rating returns to 0
DELETE FROM "Review" WHERE comment = 'Rewritten by the demo';

SELECT name, rating, "reviewCount" FROM "User" WHERE email = 'crud-alice@example.com';


-- ===========================================================================
-- Teardown. Child rows first: Booking.teacherId and Booking.learnerId are
-- RESTRICT, so a user with bookings cannot be deleted until they are gone.
-- ===========================================================================

DELETE FROM "Review" WHERE skill LIKE 'CRUD %';
DELETE FROM "Transaction" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'crud-%@example.com');
DELETE FROM "Booking" WHERE skill LIKE 'CRUD %';
DELETE FROM "SkillToLearn" WHERE "skillName" LIKE 'CRUD %';
DELETE FROM "SkillModule" WHERE "skillId" IN (SELECT id FROM "Skill" WHERE "skillName" LIKE 'CRUD %');
DELETE FROM "Skill" WHERE "skillName" LIKE 'CRUD %';
DELETE FROM "User" WHERE email LIKE 'crud-%@example.com';

-- Should return 0
SELECT COUNT(*) AS leftover_crud_users FROM "User" WHERE email LIKE 'crud-%@example.com';
