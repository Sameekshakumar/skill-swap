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
-- Rows created here use the demo-* prefix so they are easy to find and remove.
-- The teardown at the bottom deletes all of them.
--
-- "updatedAt" is set by hand on every INSERT. Prisma's @updatedAt is applied by
-- the client, not by a database default, so a raw INSERT that omits the column
-- fails with a NOT NULL violation. (SkillToLearn has no updatedAt column.)
-- ===========================================================================


-- ===========================================================================
-- 1. User
-- ===========================================================================

-- CREATE
INSERT INTO "User" (id, email, name, "passwordHash", role, status, college, "yearOfStudy", "creditBalance", "updatedAt")
VALUES (gen_random_uuid(), 'demo-alice@example.com', 'Demo Alice',
        '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRS',
        'user', 'active', 'PES University', '3rd Year', 10, NOW());

INSERT INTO "User" (id, email, name, "passwordHash", role, status, college, "yearOfStudy", "creditBalance", "updatedAt")
VALUES (gen_random_uuid(), 'demo-bob@example.com', 'Demo Bob',
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
WHERE email = 'demo-alice@example.com';

-- UPDATE: promote to admin (the same thing make-admin.js does)
UPDATE "User" SET role = 'admin' WHERE email = 'demo-alice@example.com';

-- UPDATE: suspend an account
UPDATE "User" SET status = 'suspended' WHERE email = 'demo-bob@example.com';
UPDATE "User" SET status = 'active'    WHERE email = 'demo-bob@example.com';

-- DELETE  (at the bottom, so later sections can use these rows)


-- ===========================================================================
-- 2. Skill
-- ===========================================================================

-- CREATE
INSERT INTO "Skill" (id, "userId", "skillName", description, level, "creditsPerHour", "updatedAt")
SELECT gen_random_uuid(), id, 'Demo Calculus', 'Limits, derivatives and integrals', 'Advanced', 2, NOW()
FROM "User" WHERE email = 'demo-alice@example.com';

INSERT INTO "Skill" (id, "userId", "skillName", description, level, "creditsPerHour", "updatedAt")
SELECT gen_random_uuid(), id, 'Demo Guitar', 'Chords and strumming for beginners', 'Beginner', 1, NOW()
FROM "User" WHERE email = 'demo-alice@example.com';

-- READ  (never SELECT * here: the embedding column is a vector and the Prisma
--        client cannot deserialise it. Naming columns avoids the problem.)
SELECT s.id, s."skillName", s.level, s."creditsPerHour", u.name AS teacher
FROM "Skill" s
JOIN "User" u ON u.id = s."userId"
ORDER BY s."createdAt" DESC;

-- UPDATE
UPDATE "Skill" SET "creditsPerHour" = 3, level = 'Expert'
WHERE "skillName" = 'Demo Calculus';

-- DELETE
DELETE FROM "Skill" WHERE "skillName" = 'Demo Guitar';


-- ===========================================================================
-- 3. SkillToLearn
-- ===========================================================================

-- CREATE
INSERT INTO "SkillToLearn" (id, "userId", "skillName")
SELECT gen_random_uuid(), id, 'Demo Photography'
FROM "User" WHERE email = 'demo-bob@example.com';

-- READ
SELECT l.id, l."skillName", u.name AS learner
FROM "SkillToLearn" l
JOIN "User" u ON u.id = l."userId"
ORDER BY l."createdAt" DESC;

-- UPDATE
UPDATE "SkillToLearn" SET "skillName" = 'Demo Film Photography'
WHERE "skillName" = 'Demo Photography';

-- DELETE
DELETE FROM "SkillToLearn" WHERE "skillName" = 'Demo Film Photography';


-- ===========================================================================
-- 4. Booking
-- ===========================================================================

-- CREATE  (Alice teaches, Bob learns)
INSERT INTO "Booking" (id, "teacherId", "learnerId", "skillId", skill, status,
                       "creditAmount", "dateTime", duration, notes, "updatedAt")
SELECT gen_random_uuid(), t.id, l.id, s.id, s."skillName", 'Requested',
       s."creditsPerHour" * 1, NOW() + INTERVAL '3 days', 1, 'Created by the demo script', NOW()
FROM "User" t
JOIN "Skill" s ON s."userId" = t.id AND s."skillName" = 'Demo Calculus'
CROSS JOIN "User" l
WHERE t.email = 'demo-alice@example.com' AND l.email = 'demo-bob@example.com';

-- READ
SELECT b.id, b.skill, b.status, b."creditAmount", b."dateTime",
       t.name AS teacher, l.name AS learner
FROM "Booking" b
JOIN "User" t ON t.id = b."teacherId"
JOIN "User" l ON l.id = b."learnerId"
ORDER BY b."createdAt" DESC;

-- UPDATE: accept, then mark complete by both sides
UPDATE "Booking" SET status = 'Confirmed', "updatedAt" = NOW()
WHERE skill = 'Demo Calculus' AND status = 'Requested';

UPDATE "Booking" SET "completedByTeacher" = TRUE, "completedByLearner" = TRUE,
                     status = 'Completed', "updatedAt" = NOW()
WHERE skill = 'Demo Calculus' AND status = 'Confirmed';

-- DELETE  (at the bottom — Review and Transaction reference this row)


-- ===========================================================================
-- 5. Transaction
-- ===========================================================================

-- CREATE: the learner's credits are locked when they request a session
INSERT INTO "Transaction" (id, "userId", "bookingId", type, amount, description, "updatedAt")
SELECT gen_random_uuid(), b."learnerId", b.id, 'Lock', -b."creditAmount",
       'Locked credits for the demo session', NOW()
FROM "Booking" b WHERE b.skill = 'Demo Calculus';

-- CREATE: an admin adjustment, which belongs to no booking
INSERT INTO "Transaction" (id, "userId", "bookingId", type, amount, description, "updatedAt")
SELECT gen_random_uuid(), id, NULL, 'Adjustment', 5, 'Demo goodwill credit', NOW()
FROM "User" WHERE email = 'demo-bob@example.com';

-- READ: one person's ledger, newest first
SELECT tr.type, tr.amount, tr.description, tr."createdAt", u.name
FROM "Transaction" tr
JOIN "User" u ON u.id = tr."userId"
WHERE u.email = 'demo-bob@example.com'
ORDER BY tr."createdAt" DESC;

-- READ: does the ledger agree with the balance?
SELECT u.name, u."creditBalance", COALESCE(SUM(tr.amount), 0) AS ledger_sum
FROM "User" u
LEFT JOIN "Transaction" tr ON tr."userId" = u.id
GROUP BY u.id, u.name, u."creditBalance";

-- UPDATE
UPDATE "Transaction" SET description = 'Demo goodwill credit (corrected)'
WHERE description = 'Demo goodwill credit';

-- DELETE
DELETE FROM "Transaction" WHERE description = 'Demo goodwill credit (corrected)';


-- ===========================================================================
-- 6. Review
-- ===========================================================================
-- Inserting here fires the review_rating_sync trigger, which rewrites the
-- reviewee's rating and reviewCount. See docs/04-trigger.md.

-- BEFORE
SELECT name, rating, "reviewCount" FROM "User" WHERE email = 'demo-alice@example.com';

-- CREATE  (Bob reviews Alice for the completed session)
INSERT INTO "Review" (id, "reviewerId", "revieweeId", "bookingId", rating, comment, skill, "updatedAt")
SELECT gen_random_uuid(), b."learnerId", b."teacherId", b.id, 5,
       'Very clear explanations', b.skill, NOW()
FROM "Booking" b WHERE b.skill = 'Demo Calculus';

-- AFTER: rating 0 -> 5, reviewCount 0 -> 1, written by the trigger
SELECT name, rating, "reviewCount" FROM "User" WHERE email = 'demo-alice@example.com';

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

SELECT name, rating, "reviewCount" FROM "User" WHERE email = 'demo-alice@example.com';

-- DELETE: back to 0 reviews, so the rating returns to 0
DELETE FROM "Review" WHERE comment = 'Rewritten by the demo';

SELECT name, rating, "reviewCount" FROM "User" WHERE email = 'demo-alice@example.com';


-- ===========================================================================
-- Teardown. Child rows first: Booking.teacherId and Booking.learnerId are
-- RESTRICT, so a user with bookings cannot be deleted until they are gone.
-- ===========================================================================

DELETE FROM "Review" WHERE skill LIKE 'Demo %';
DELETE FROM "Transaction" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'demo-%@example.com');
DELETE FROM "Booking" WHERE skill LIKE 'Demo %';
DELETE FROM "SkillToLearn" WHERE "skillName" LIKE 'Demo %';
DELETE FROM "Skill" WHERE "skillName" LIKE 'Demo %';
DELETE FROM "User" WHERE email LIKE 'demo-%@example.com';

-- Should return 0
SELECT COUNT(*) AS leftover_demo_users FROM "User" WHERE email LIKE 'demo-%@example.com';
