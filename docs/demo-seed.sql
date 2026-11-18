-- ===========================================================================
-- Demo data. Unlike crud-operations.sql, this LEAVES the rows in place, so the
-- queries in demo-queries.sql have something to return.
--
--   psql "<url>" -f docs/demo-seed.sql       # set up
--   psql "<url>" -f docs/demo-teardown.sql   # remove it all afterwards
--
-- Creates four users in a teaching chain:
--
--     Alice ──teaches──▶ Bob ──teaches──▶ Carol
--       └────────────teaches────────────▶ Dan
--
-- which gives the recursive query a two-hop path to find, the aggregate
-- queries several teachers to rank, and the trigger some reviews to average.
--
-- Safe to re-run: it deletes its own rows first.
-- Every id and email is prefixed demo- so nothing real is touched.
-- ===========================================================================

BEGIN;

-- Clear any previous run, children first (Booking -> User is RESTRICT).
DELETE FROM "Review"       WHERE "bookingId" LIKE 'demo-bk%';
DELETE FROM "Transaction"  WHERE "userId" LIKE 'demo-u%';
DELETE FROM "Booking"      WHERE id LIKE 'demo-bk%';
DELETE FROM "SkillToLearn" WHERE "userId" LIKE 'demo-u%';
DELETE FROM "Skill"        WHERE id LIKE 'demo-sk%';
DELETE FROM "User"         WHERE id LIKE 'demo-u%';

-- --- Users ---------------------------------------------------------------
-- The hash is a real bcrypt hash of 'demo-password-123', so these accounts
-- can actually be signed into in the UI if you want to show that too.
INSERT INTO "User" (id, email, name, "passwordHash", role, status, college, "yearOfStudy", bio, "creditBalance", "updatedAt") VALUES
 ('demo-u-alice', 'demo-alice@example.com', 'Demo Alice', '$2b$10$N9qo8uLOickgx2ZMRZoMye1VdLvCqZmTiLQ0eQ4nXKLSB2qkUE1Oi', 'admin', 'active', 'PES University', '4th Year', 'Maths tutor and occasional guitarist', 10, NOW()),
 ('demo-u-bob',   'demo-bob@example.com',   'Demo Bob',   '$2b$10$N9qo8uLOickgx2ZMRZoMye1VdLvCqZmTiLQ0eQ4nXKLSB2qkUE1Oi', 'user',  'active', 'PES University', '3rd Year', 'Learning maths, teaching guitar',        10, NOW()),
 ('demo-u-carol', 'demo-carol@example.com', 'Demo Carol', '$2b$10$N9qo8uLOickgx2ZMRZoMye1VdLvCqZmTiLQ0eQ4nXKLSB2qkUE1Oi', 'user',  'active', 'RV College',     '2nd Year', 'Here to learn an instrument',            10, NOW()),
 ('demo-u-dan',   'demo-dan@example.com',   'Demo Dan',   '$2b$10$N9qo8uLOickgx2ZMRZoMye1VdLvCqZmTiLQ0eQ4nXKLSB2qkUE1Oi', 'user',  'suspended', 'RV College',   '1st Year', 'Suspended, to show the status filter',   10, NOW());

-- --- Skills offered ------------------------------------------------------
INSERT INTO "Skill" (id, "userId", "skillName", description, level, "creditsPerHour", "updatedAt") VALUES
 ('demo-sk-calc',  'demo-u-alice', 'Demo Calculus',      'Limits, derivatives and integrals from scratch', 'Advanced',     3, NOW()),
 ('demo-sk-stats', 'demo-u-alice', 'Demo Statistics',    'Distributions, hypothesis testing, p-values',    'Intermediate', 2, NOW()),
 ('demo-sk-gtr',   'demo-u-bob',   'Demo Guitar',        'Open chords, strumming and your first songs',    'Beginner',     1, NOW()),
 ('demo-sk-photo', 'demo-u-carol', 'Demo Photography',   'Exposure, composition and editing basics',       'Intermediate', 2, NOW());

-- --- Skills wanted -------------------------------------------------------
INSERT INTO "SkillToLearn" (id, "userId", "skillName") VALUES
 ('demo-wl-1', 'demo-u-bob',   'Demo Calculus'),
 ('demo-wl-2', 'demo-u-carol', 'Demo Guitar'),
 ('demo-wl-3', 'demo-u-dan',   'Demo Statistics');

-- --- Bookings ------------------------------------------------------------
-- Three completed (so credits have moved and reviews are possible), one still
-- pending, one cancelled — enough for "bookings by status" to be interesting.
INSERT INTO "Booking" (id, "teacherId", "learnerId", "skillId", skill, status, "creditAmount", "dateTime", duration, "completedByTeacher", "completedByLearner", "cancelledBy", notes, "updatedAt") VALUES
 ('demo-bk-1', 'demo-u-alice', 'demo-u-bob',   'demo-sk-calc',  'Demo Calculus',    'Completed', 3, NOW() - INTERVAL '10 days', 1, TRUE, TRUE, NULL,      'Went well',            NOW()),
 ('demo-bk-2', 'demo-u-bob',   'demo-u-carol', 'demo-sk-gtr',   'Demo Guitar',      'Completed', 1, NOW() - INTERVAL '6 days',  1, TRUE, TRUE, NULL,      'First lesson',         NOW()),
 ('demo-bk-3', 'demo-u-alice', 'demo-u-dan',   'demo-sk-stats', 'Demo Statistics',  'Completed', 4, NOW() - INTERVAL '4 days',  2, TRUE, TRUE, NULL,      'Two hour session',     NOW()),
 ('demo-bk-4', 'demo-u-carol', 'demo-u-bob',   'demo-sk-photo', 'Demo Photography', 'Requested', 2, NOW() + INTERVAL '3 days',  1, FALSE, FALSE, NULL,     'Waiting on a reply',   NOW()),
 ('demo-bk-5', 'demo-u-alice', 'demo-u-carol', 'demo-sk-calc',  'Demo Calculus',    'Cancelled', 3, NOW() + INTERVAL '5 days',  1, FALSE, FALSE, 'learner', 'Learner backed out',  NOW());

-- --- Ledger --------------------------------------------------------------
-- What the application would have written for the bookings above.
INSERT INTO "Transaction" (id, "userId", "bookingId", type, amount, description, "updatedAt") VALUES
 ('demo-tx-1', 'demo-u-bob',   'demo-bk-1', 'Lock',     -3, 'Locked credits for Demo Calculus',   NOW()),
 ('demo-tx-2', 'demo-u-bob',   'demo-bk-1', 'Transfer', -0, 'Paid for Demo Calculus',             NOW()),
 ('demo-tx-3', 'demo-u-alice', 'demo-bk-1', 'Transfer',  3, 'Earned from Demo Calculus',          NOW()),
 ('demo-tx-4', 'demo-u-carol', 'demo-bk-2', 'Lock',     -1, 'Locked credits for Demo Guitar',     NOW()),
 ('demo-tx-5', 'demo-u-bob',   'demo-bk-2', 'Transfer',  1, 'Earned from Demo Guitar',            NOW()),
 ('demo-tx-6', 'demo-u-dan',   'demo-bk-3', 'Lock',     -4, 'Locked credits for Demo Statistics', NOW()),
 ('demo-tx-7', 'demo-u-alice', 'demo-bk-3', 'Transfer',  4, 'Earned from Demo Statistics',        NOW()),
 ('demo-tx-8', 'demo-u-carol', 'demo-bk-5', 'Refund',    3, 'Refunded after cancellation',        NOW());

-- Balances to match the ledger (10 starting credits plus the rows above).
UPDATE "User" SET "creditBalance" = 10 + (SELECT COALESCE(SUM(amount),0) FROM "Transaction" WHERE "userId" = "User".id)
WHERE id LIKE 'demo-u%';

-- --- Reviews -------------------------------------------------------------
-- Inserting these fires review_rating_sync_trigger, which fills in
-- User.rating and User.reviewCount. Nothing below touches "User" directly.
INSERT INTO "Review" (id, "reviewerId", "revieweeId", "bookingId", rating, comment, skill, "updatedAt") VALUES
 ('demo-rv-1', 'demo-u-bob',   'demo-u-alice', 'demo-bk-1', 5, 'Explained limits better than my lecturer', 'Demo Calculus',   NOW()),
 ('demo-rv-2', 'demo-u-dan',   'demo-u-alice', 'demo-bk-3', 4, 'Clear, if a little fast',                  'Demo Statistics', NOW()),
 ('demo-rv-3', 'demo-u-carol', 'demo-u-bob',   'demo-bk-2', 5, 'Patient with a complete beginner',         'Demo Guitar',     NOW()),
 ('demo-rv-4', 'demo-u-alice', 'demo-u-bob',   'demo-bk-1', 4, 'Asked good questions',                     'Demo Calculus',   NOW());

COMMIT;

-- --- What the trigger produced ------------------------------------------
-- Alice: (5 + 4) / 2 = 4.5 from 2 reviews.  Bob: (5 + 4) / 2 = 4.5 from 2.
SELECT name, role, status, "creditBalance", rating, "reviewCount"
FROM "User" WHERE id LIKE 'demo-u%' ORDER BY name;
