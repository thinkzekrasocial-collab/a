-- =====================================================================
-- 010_add_opening_stock.sql
-- Patch: the part master records its opening balance here. The LIVE
-- balance is never stored — it is always computed from the ledger:
--   current = opening_stock + SUM(IN) - SUM(OUT)
-- =====================================================================

ALTER TABLE parts ADD COLUMN opening_stock REAL NOT NULL DEFAULT 0;
