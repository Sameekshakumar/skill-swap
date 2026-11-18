-- A stored procedure for adjusting a user's credits.
--
-- Mirrors POST /api/admin/users/:id/credits, with the same two guarantees the
-- application gives: a deduction can never take a balance below zero, and every
-- adjustment writes a Transaction row so the ledger still explains the balance.
--
-- A PROCEDURE rather than a FUNCTION because it exists for its effects, not for
-- a return value, and it is called with CALL.

CREATE OR REPLACE PROCEDURE adjust_user_credits(
  p_user_id TEXT,
  p_amount  INT,
  p_reason  TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows INT;
BEGIN
  IF p_amount = 0 THEN
    RAISE EXCEPTION 'Amount must not be zero';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  -- The balance check and the write are one statement. Reading the balance,
  -- deciding in application code, then writing it back would let two
  -- simultaneous deductions both pass the check.
  UPDATE "User"
  SET "creditBalance" = "creditBalance" + p_amount,
      "updatedAt"     = NOW()
  WHERE id = p_user_id
    AND (p_amount > 0 OR "creditBalance" >= -p_amount);

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Zero rows means one of two different problems; say which.
  IF v_rows = 0 THEN
    IF NOT EXISTS (SELECT 1 FROM "User" WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'User % not found', p_user_id;
    ELSE
      RAISE EXCEPTION 'Deducting % would take the balance below zero', -p_amount;
    END IF;
  END IF;

  INSERT INTO "Transaction" (id, "userId", "bookingId", type, amount, description, "updatedAt")
  VALUES (gen_random_uuid(), p_user_id, NULL, 'Adjustment', p_amount, btrim(p_reason), NOW());
END;
$$;

-- A companion function: the current balance rebuilt from the ledger alone.
-- Everyone starts with 10 credits, so the balance should equal 10 plus the sum
-- of their transactions. Disagreement means something wrote a balance without
-- recording why.
CREATE OR REPLACE FUNCTION ledger_balance(p_user_id TEXT)
RETURNS INT AS $$
  SELECT 10 + COALESCE(SUM(amount), 0)::INT
  FROM "Transaction"
  WHERE "userId" = p_user_id;
$$ LANGUAGE sql STABLE;
