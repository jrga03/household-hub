-- ============================================================================
-- Signed-ledger debt payments
-- Companion to the client-side redesign (docs/reviews/2026-07-02-architecture-
-- review.md DEBT-13, fixing DEBT-02/03): balance = original - SUM(ALL rows),
-- with compensating rows stored as the exact NEGATION of their target and
-- ALWAYS linked via reverses_payment_id (uniform at any cascade depth).
--
-- Note: this restores the schema's original design intent. The table comment
-- already said "Positive for payment, negative for reversal"; the client had
-- drifted to an exclusion-based model that stored reversals positive.
-- ============================================================================

-- ============================================================================
-- 1. Data migration: negate any reversal rows stored positive under the old
--    exclusion model. Totals are preserved: an excluded (P, R) pair
--    contributed 0 to the old sum, and P + (-P) = 0 in the signed sum.
--    (Debt sync was previously broken end-to-end, so in practice this table
--    is expected to be empty or tiny; the UPDATE is defensive.)
-- ============================================================================

UPDATE debt_payments
SET amount_cents = -amount_cents
WHERE is_reversal = TRUE
  AND amount_cents > 0;

-- ============================================================================
-- 2. Constraint: the old reversal_amount_negative CHECK required every
--    linked row to be negative, which forbids reversal-of-reversal rows
--    (linked AND positive). Replace it with a trigger that enforces the
--    real invariant: a compensating row's amount is the exact negation of
--    its target row's amount.
-- ============================================================================

ALTER TABLE debt_payments DROP CONSTRAINT IF EXISTS reversal_amount_negative;

CREATE OR REPLACE FUNCTION validate_reversal_amount()
RETURNS TRIGGER AS $$
DECLARE
  target_amount BIGINT;
BEGIN
  IF NEW.reverses_payment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT amount_cents INTO target_amount
  FROM debt_payments
  WHERE id = NEW.reverses_payment_id;

  IF target_amount IS NULL THEN
    RAISE EXCEPTION 'Reversal target payment % not found', NEW.reverses_payment_id;
  END IF;

  IF NEW.amount_cents != -target_amount THEN
    RAISE EXCEPTION
      'Reversal amount must be the exact negation of its target (target: %, got: %)',
      target_amount, NEW.amount_cents;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

DROP TRIGGER IF EXISTS validate_reversal_amount_trigger ON debt_payments;
CREATE TRIGGER validate_reversal_amount_trigger
BEFORE INSERT ON debt_payments
FOR EACH ROW EXECUTE FUNCTION validate_reversal_amount();

-- ============================================================================
-- 3. Overpayment detection trigger: switch the balance subquery to the
--    signed sum over ALL rows, matching the client. The old exclusion-based
--    join double-ignored reversal pairs and could not represent cascades.
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_debt_payment_overpayment()
RETURNS TRIGGER AS $$
DECLARE
  current_balance BIGINT;
BEGIN
  -- Reversals are corrections, not payments: they never count as overpayment
  IF NEW.reverses_payment_id IS NOT NULL OR NEW.is_reversal = TRUE THEN
    NEW.is_overpayment := FALSE;
    NEW.overpayment_amount := NULL;
    RETURN NEW;
  END IF;

  -- Balance before this payment: original - signed sum of ALL existing rows
  IF NEW.debt_id IS NOT NULL THEN
    SELECT d.original_amount_cents - COALESCE(SUM(dp.amount_cents), 0)
    INTO current_balance
    FROM debts d
    LEFT JOIN debt_payments dp ON dp.debt_id = d.id
    WHERE d.id = NEW.debt_id
    GROUP BY d.original_amount_cents;
  ELSIF NEW.internal_debt_id IS NOT NULL THEN
    SELECT d.original_amount_cents - COALESCE(SUM(dp.amount_cents), 0)
    INTO current_balance
    FROM internal_debts d
    LEFT JOIN debt_payments dp ON dp.internal_debt_id = d.id
    WHERE d.id = NEW.internal_debt_id
    GROUP BY d.original_amount_cents;
  END IF;

  -- Set overpayment flags: balance <= 0 OR payment > balance
  NEW.is_overpayment := (current_balance <= 0 OR NEW.amount_cents > current_balance);

  IF NEW.is_overpayment THEN
    NEW.overpayment_amount := CASE
      WHEN current_balance > 0 THEN NEW.amount_cents - current_balance
      ELSE NEW.amount_cents
    END;
  ELSE
    NEW.overpayment_amount := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

COMMENT ON FUNCTION validate_debt_payment_overpayment() IS
  'Signed-ledger overpayment detection: balance = original - SUM(all rows). Reversal rows are exempt.';
