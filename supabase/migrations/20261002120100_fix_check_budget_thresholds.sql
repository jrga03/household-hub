-- db lint: SUM(bigint) is numeric, so RETURN QUERY failed on every call
-- ("Returned type numeric does not match expected type bigint in column 6").
-- Same body as 20260702120000_security_hardening.sql with spent_cents cast to
-- BIGINT; CREATE OR REPLACE keeps the service_role-only grant.
CREATE OR REPLACE FUNCTION public.check_budget_thresholds()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  category_id UUID,
  category_name TEXT,
  amount_cents BIGINT,
  spent_cents BIGINT,
  percentage INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH budget_spending AS (
    SELECT
      b.id,
      b.household_id,
      b.category_id,
      b.amount_cents,
      c.name AS category_name,
      -- SUM(bigint) is numeric; the declared column is bigint
      COALESCE(SUM(
        CASE
          WHEN t.type = 'expense' AND t.transfer_group_id IS NULL
          THEN t.amount_cents
          ELSE 0
        END
      ), 0)::BIGINT AS spent_cents
    FROM budgets b
    INNER JOIN categories c ON b.category_id = c.id
    LEFT JOIN transactions t ON
      t.category_id = b.category_id
      AND (EXTRACT(YEAR FROM t.date) * 100 + EXTRACT(MONTH FROM t.date))::INT = b.month_key
      AND t.transfer_group_id IS NULL
    WHERE
      b.month >= DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Manila'))::DATE
    GROUP BY b.id, b.household_id, b.category_id, b.amount_cents, c.name
  )
  SELECT
    bs.id,
    p.id AS user_id,
    bs.category_id,
    bs.category_name,
    bs.amount_cents,
    bs.spent_cents,
    CASE
      WHEN bs.amount_cents > 0
      THEN ((bs.spent_cents * 100) / bs.amount_cents)::INTEGER
      ELSE 0
    END AS percentage
  FROM budget_spending bs
  CROSS JOIN profiles p
  WHERE
    p.household_id = bs.household_id
    AND bs.amount_cents > 0
    AND ((bs.spent_cents * 100) / bs.amount_cents) >= 80
  ORDER BY percentage DESC;
END;
$$;
