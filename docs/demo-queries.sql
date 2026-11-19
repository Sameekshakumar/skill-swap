-- ===========================================================================
-- Queries to have ready. Requirements 6 and 8.
--
-- Ordered simple -> complex. The last one is the nested query for
-- requirement 8, with an explanation of what each layer does.
-- ===========================================================================


-- --- Counting and roles (requirement 1) -----------------------------------

-- How many users
SELECT COUNT(*) AS total_users FROM "User";

-- Users per role
SELECT role, COUNT(*) AS users
FROM "User"
GROUP BY role
ORDER BY role;

-- Users by role and status together
SELECT role, status, COUNT(*) AS users
FROM "User"
GROUP BY role, status
ORDER BY role, status;

-- Everyone, with the headline columns
SELECT name, email, role, status, "creditBalance", rating, "reviewCount"
FROM "User"
ORDER BY "createdAt";


-- --- Single-table questions -----------------------------------------------

-- The most expensive skills on offer
SELECT "skillName", level, "creditsPerHour"
FROM "Skill"
ORDER BY "creditsPerHour" DESC, "skillName"
LIMIT 10;

-- How many skills at each level
SELECT level, COUNT(*) AS listings
FROM "Skill"
GROUP BY level
ORDER BY COUNT(*) DESC;

-- Bookings by status
SELECT status, COUNT(*) AS bookings, SUM("creditAmount") AS credits_involved
FROM "Booking"
GROUP BY status
ORDER BY status;

-- Sessions still to happen
SELECT skill, "dateTime", "creditAmount"
FROM "Booking"
WHERE status = 'Confirmed' AND "dateTime" > NOW()
ORDER BY "dateTime";


-- --- Joins ----------------------------------------------------------------

-- Every skill with the person teaching it
SELECT u.name AS teacher, u.college, s."skillName", s.level, s."creditsPerHour"
FROM "Skill" s
JOIN "User" u ON u.id = s."userId"
ORDER BY u.name, s."skillName";

-- Bookings with both participants named (two joins to the same table)
SELECT b.skill, b.status, b."creditAmount",
       t.name AS teacher, l.name AS learner
FROM "Booking" b
JOIN "User" t ON t.id = b."teacherId"
JOIN "User" l ON l.id = b."learnerId"
ORDER BY b."createdAt" DESC;

-- Reviews with who wrote them and who they are about
SELECT r.rating, r.skill, r.comment,
       author.name AS written_by, subject.name AS about
FROM "Review" r
JOIN "User" author  ON author.id  = r."reviewerId"
JOIN "User" subject ON subject.id = r."revieweeId"
ORDER BY r."createdAt" DESC;

-- LEFT JOIN: users who have never listed a skill
-- (an INNER JOIN would hide exactly the people being asked about)
SELECT u.name, u.email
FROM "User" u
LEFT JOIN "Skill" s ON s."userId" = u.id
WHERE s.id IS NULL
ORDER BY u.name;


-- --- Aggregates -----------------------------------------------------------

-- Credits earned per teacher, highest first
SELECT u.name,
       COUNT(b.id)                AS sessions_taught,
       COALESCE(SUM(b."creditAmount"), 0) AS credits_earned
FROM "User" u
LEFT JOIN "Booking" b ON b."teacherId" = u.id AND b.status = 'Completed'
GROUP BY u.id, u.name
ORDER BY credits_earned DESC;

-- HAVING: only teachers with more than one completed session
SELECT u.name, COUNT(b.id) AS sessions_taught
FROM "User" u
JOIN "Booking" b ON b."teacherId" = u.id AND b.status = 'Completed'
GROUP BY u.id, u.name
HAVING COUNT(b.id) > 1
ORDER BY sessions_taught DESC;

-- Does every ledger agree with the stored balance?
-- Any non-zero difference is a bug worth knowing about.
SELECT u.name,
       u."creditBalance"                  AS balance,
       10 + COALESCE(SUM(tr.amount), 0)   AS expected_from_ledger,
       u."creditBalance" - (10 + COALESCE(SUM(tr.amount), 0)) AS difference
FROM "User" u
LEFT JOIN "Transaction" tr ON tr."userId" = u.id
GROUP BY u.id, u.name, u."creditBalance"
ORDER BY u.name;


-- --- Subqueries -----------------------------------------------------------

-- Scalar subquery: skills priced above the average rate
SELECT "skillName", "creditsPerHour"
FROM "Skill"
WHERE "creditsPerHour" > (SELECT AVG("creditsPerHour") FROM "Skill")
ORDER BY "creditsPerHour" DESC;

-- IN: everyone who has ever taught a session
SELECT name, email
FROM "User"
WHERE id IN (SELECT "teacherId" FROM "Booking" WHERE status = 'Completed')
ORDER BY name;

-- NOT EXISTS: teachers nobody has reviewed yet
SELECT u.name, u.email
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "Skill" s WHERE s."userId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM "Review" r WHERE r."revieweeId" = u.id)
ORDER BY u.name;

-- Correlated subquery: each skill against its own teacher's average rate
SELECT s."skillName", s."creditsPerHour",
       (SELECT ROUND(AVG(s2."creditsPerHour"), 2)
        FROM "Skill" s2
        WHERE s2."userId" = s."userId") AS this_teachers_average
FROM "Skill" s
ORDER BY s."skillName";


-- ===========================================================================
-- The curriculum: Skill -> SkillModule, the second-level 1:N
-- ===========================================================================
--
-- Every other table hangs straight off "User". "SkillModule" hangs off
-- "Skill", so reading a teacher's curriculum is a three-table join.

-- Each skill with its modules in teaching order.
SELECT u.name AS teacher, s."skillName", m."position" + 1 AS step, m.title
FROM "Skill" s
JOIN "User" u        ON u.id = s."userId"
JOIN "SkillModule" m ON m."skillId" = s.id
WHERE s.id LIKE 'demo-sk%'
ORDER BY u.name, s."skillName", m."position";

-- How deep each curriculum goes. LEFT JOIN so a skill with no modules still
-- appears, with 0 — an INNER JOIN would silently hide it.
SELECT s."skillName",
       COUNT(m.id)                      AS modules,
       ROUND(AVG(LENGTH(m.content)), 1) AS avg_content_chars
FROM "Skill" s
LEFT JOIN "SkillModule" m ON m."skillId" = s.id
WHERE s.id LIKE 'demo-sk%'
GROUP BY s."skillName"
ORDER BY modules DESC, s."skillName";

-- Which listings still have no curriculum at all.
SELECT s."skillName", u.name AS teacher
FROM "Skill" s
JOIN "User" u ON u.id = s."userId"
WHERE s.id LIKE 'demo-sk%'
  AND NOT EXISTS (SELECT 1 FROM "SkillModule" m WHERE m."skillId" = s.id);


-- ===========================================================================
-- REQUIREMENT 8 — the complex nested query
-- ===========================================================================
--
-- Question it answers:
--   "Which teachers are performing above average, and how do they rank?"
--
-- Specifically: every teacher who has completed at least one session, with
-- their total credits earned, average rating from reviews, and position in the
-- ranking — keeping only those who earned more than the platform-wide average.
--
-- Four layers:
--   1. CTE `teacher_totals`  — aggregates bookings per teacher
--   2. CTE `review_totals`   — aggregates reviews per teacher, separately,
--                              because joining both at once would multiply
--                              rows and inflate the credit sums
--   3. scalar subquery       — the platform average, computed from layer 1
--   4. window function       — RANK() over the surviving rows
-- ===========================================================================

WITH teacher_totals AS (
    -- Layer 1: what each teacher earned
    SELECT
        b."teacherId"                AS teacher_id,
        COUNT(*)                     AS sessions_taught,
        SUM(b."creditAmount")        AS credits_earned,
        ROUND(AVG(b."creditAmount"), 2) AS avg_session_value
    FROM "Booking" b
    WHERE b.status = 'Completed'
    GROUP BY b."teacherId"
),
review_totals AS (
    -- Layer 2: how each teacher was rated. Kept apart from layer 1 on
    -- purpose: a teacher with 3 sessions and 2 reviews would otherwise
    -- produce 6 rows and triple the credits.
    SELECT
        r."revieweeId"        AS teacher_id,
        COUNT(*)              AS reviews_received,
        ROUND(AVG(r.rating), 2) AS avg_rating
    FROM "Review" r
    GROUP BY r."revieweeId"
)
SELECT
    u.name                                   AS teacher,
    u.college,
    t.sessions_taught,
    t.credits_earned,
    t.avg_session_value,
    COALESCE(rv.reviews_received, 0)         AS reviews_received,
    COALESCE(rv.avg_rating, 0)               AS avg_rating,
    -- Layer 4: rank by earnings, highest first
    RANK() OVER (ORDER BY t.credits_earned DESC) AS earnings_rank
FROM teacher_totals t
JOIN "User" u ON u.id = t.teacher_id
-- LEFT JOIN: a teacher with sessions but no reviews must still appear
LEFT JOIN review_totals rv ON rv.teacher_id = t.teacher_id
-- Layer 3: above the platform average only
WHERE t.credits_earned > (
    SELECT AVG(credits_earned) FROM teacher_totals
)
ORDER BY t.credits_earned DESC, u.name;


-- ===========================================================================
-- RECURSIVE QUERY — how knowledge spreads through the network
-- ===========================================================================
--
-- Completed bookings form a graph: an edge from teacher to learner means
-- knowledge moved along it. A recursive CTE walks that graph.
--
-- Question: starting from each teacher, who is reachable, and in how many
-- hops? If Alice taught Bob and Bob taught Carol, then Carol is two hops from
-- Alice even though they never met.
--
-- Two things make this safe rather than infinite:
--   * the path array plus `<> ALL(path)` stops a cycle — A teaches B, B
--     teaches A is perfectly legal in this app and would otherwise loop
--     forever
--   * the depth cap is a second belt-and-braces stop
-- ===========================================================================

WITH RECURSIVE teaching_chain AS (
    -- Base case: everyone directly taught by someone
    SELECT
        b."teacherId"                            AS origin_id,
        b."learnerId"                            AS reached_id,
        1                                        AS hops,
        ARRAY[b."teacherId", b."learnerId"]      AS path
    FROM "Booking" b
    WHERE b.status = 'Completed'

    UNION ALL

    -- Recursive case: follow the people they went on to teach
    SELECT
        tc.origin_id,
        b."learnerId",
        tc.hops + 1,
        tc.path || b."learnerId"
    FROM teaching_chain tc
    JOIN "Booking" b
      ON b."teacherId" = tc.reached_id
     AND b.status = 'Completed'
    WHERE b."learnerId" <> ALL(tc.path)   -- cycle guard
      AND tc.hops < 5                     -- depth cap
)
SELECT
    origin.name   AS knowledge_from,
    reached.name  AS reached,
    tc.hops,
    -- The chain of names, readable
    (SELECT string_agg(u.name, ' -> ' ORDER BY idx)
     FROM unnest(tc.path) WITH ORDINALITY AS t(uid, idx)
     JOIN "User" u ON u.id = t.uid)       AS chain
FROM teaching_chain tc
JOIN "User" origin  ON origin.id  = tc.origin_id
JOIN "User" reached ON reached.id = tc.reached_id
ORDER BY knowledge_from, tc.hops, reached;


-- A smaller recursive example, if the graph one is more than is wanted:
-- generate the next 7 days, then count sessions booked on each. A plain
-- GROUP BY would omit days with no bookings; the generated series keeps them.
WITH RECURSIVE next_week(day) AS (
    SELECT CURRENT_DATE
    UNION ALL
    SELECT day + 1 FROM next_week WHERE day < CURRENT_DATE + 6
)
SELECT w.day,
       COUNT(b.id) AS sessions
FROM next_week w
LEFT JOIN "Booking" b
       ON b."dateTime"::date = w.day
      AND b.status IN ('Requested', 'Confirmed')
GROUP BY w.day
ORDER BY w.day;


-- ===========================================================================
-- A simpler nested query, if the one above is more than is wanted
-- ===========================================================================
-- Teachers whose average rating beats the platform average rating.

SELECT u.name,
       ROUND(AVG(r.rating), 2) AS their_average,
       (SELECT ROUND(AVG(rating), 2) FROM "Review") AS platform_average
FROM "User" u
JOIN "Review" r ON r."revieweeId" = u.id
GROUP BY u.id, u.name
HAVING AVG(r.rating) > (SELECT AVG(rating) FROM "Review")
ORDER BY their_average DESC;


-- ===========================================================================
-- Inspecting the schema itself, if asked to prove something exists
-- ===========================================================================

-- Every table
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Columns of one table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'User'
ORDER BY ordinal_position;

-- Every foreign key, with its delete rule
SELECT tc.table_name    AS child_table,
       kcu.column_name  AS child_column,
       ccu.table_name   AS parent_table,
       rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
     ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu
     ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc
     ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY child_table, child_column;

-- Every index
SELECT tablename, indexname FROM pg_indexes
WHERE schemaname = 'public' ORDER BY tablename, indexname;

-- Triggers and the functions behind them
SELECT trigger_name, event_object_table, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY trigger_name, event_manipulation;

-- Our own functions only. An unfiltered list returns ~120 rows, because the
-- pgvector extension installs all of its operators into public too.
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('refresh_user_rating', 'review_rating_sync')
ORDER BY routine_name;

-- The query plan, if asked whether an index is used
EXPLAIN ANALYZE
SELECT * FROM "Booking" WHERE status = 'Completed';
