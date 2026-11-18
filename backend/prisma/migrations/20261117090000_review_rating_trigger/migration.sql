-- Keep User.rating and User.reviewCount in step with the Review table.
--
-- This used to be done in JavaScript in routes/reviews.js and routes/admin.js:
-- aggregate the reviews, then write the average back. Two call sites meant two
-- chances to forget. The database now owns it, so any INSERT, UPDATE or DELETE
-- on Review keeps the aggregate correct, including a raw psql statement typed
-- by hand.

CREATE OR REPLACE FUNCTION refresh_user_rating(target_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE "User" u
  SET
    -- No reviews left means no rating, not NULL: the column is NOT NULL and
    -- the UI reads 0 as "not rated yet".
    rating = COALESCE(
      (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM "Review" r WHERE r."revieweeId" = target_id),
      0
    ),
    "reviewCount" = (SELECT COUNT(*) FROM "Review" r WHERE r."revieweeId" = target_id)
  WHERE u.id = target_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION review_rating_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- DELETE has no NEW, INSERT has no OLD.
  IF TG_OP <> 'INSERT' THEN
    PERFORM refresh_user_rating(OLD."revieweeId");
  END IF;

  -- On an UPDATE that moved the review to a different person, both the old
  -- and the new reviewee need recomputing.
  IF TG_OP <> 'DELETE' THEN
    PERFORM refresh_user_rating(NEW."revieweeId");
  END IF;

  RETURN NULL; -- AFTER trigger: the return value is ignored.
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS review_rating_sync_trigger ON "Review";

CREATE TRIGGER review_rating_sync_trigger
AFTER INSERT OR UPDATE OR DELETE ON "Review"
FOR EACH ROW
EXECUTE FUNCTION review_rating_sync();

-- Bring every existing row in line with what the trigger would have produced.
DO $$
DECLARE u RECORD;
BEGIN
  FOR u IN SELECT id FROM "User" LOOP
    PERFORM refresh_user_rating(u.id);
  END LOOP;
END $$;
