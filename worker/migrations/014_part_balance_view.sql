-- =====================================================================
-- 014_part_balance_view.sql
-- Convenience view: part master + current_balance computed from the
-- ledger. The API reads balances from here everywhere.
-- =====================================================================

CREATE VIEW IF NOT EXISTS v_part_balance AS
SELECT
  p.*,
  (
    p.opening_stock
    + COALESCE((SELECT SUM(t.quantity) FROM stock_transactions t
                WHERE t.part_id = p.id AND t.transaction_type = 'IN'), 0)
    - COALESCE((SELECT SUM(t.quantity) FROM stock_transactions t
                WHERE t.part_id = p.id AND t.transaction_type = 'OUT'), 0)
  ) AS current_balance
FROM parts p;
