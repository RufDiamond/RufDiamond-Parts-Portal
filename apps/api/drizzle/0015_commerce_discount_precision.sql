-- Match the shared six-place rate contract. Existing rates are constrained to
-- [0, 1], so this preserves every existing four-place value without rounding.
ALTER TABLE commerce_order
  ALTER COLUMN discount_rate TYPE numeric(7,6)
  USING discount_rate::numeric(7,6);
