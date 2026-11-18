-- Removes everything demo-seed.sql created.
-- Children first: Booking -> User is RESTRICT, so users cannot go until their
-- bookings have.

DELETE FROM "Review"       WHERE "bookingId" LIKE 'demo-bk%';
DELETE FROM "Transaction"  WHERE "userId" LIKE 'demo-u%';
DELETE FROM "Booking"      WHERE id LIKE 'demo-bk%';
DELETE FROM "SkillToLearn" WHERE "userId" LIKE 'demo-u%';
DELETE FROM "Skill"        WHERE id LIKE 'demo-sk%';
DELETE FROM "User"         WHERE id LIKE 'demo-u%';

-- Also clears anything left behind by an interrupted crud-operations.sql run.
DELETE FROM "Review"       WHERE skill LIKE 'CRUD %';
DELETE FROM "Transaction"  WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'crud-%@example.com');
DELETE FROM "Booking"      WHERE skill LIKE 'CRUD %';
DELETE FROM "SkillToLearn" WHERE "skillName" LIKE 'CRUD %';
DELETE FROM "Skill"        WHERE "skillName" LIKE 'CRUD %';
DELETE FROM "User"         WHERE email LIKE 'crud-%@example.com' OR email LIKE 'demo-%@example.com';

SELECT COUNT(*) AS leftover_rows FROM "User"
WHERE id LIKE 'demo-u%' OR email LIKE 'demo-%@example.com' OR email LIKE 'crud-%@example.com';
