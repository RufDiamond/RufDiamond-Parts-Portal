ALTER TABLE commerce_order_line
  ADD COLUMN price_source text,
  ADD COLUMN quote_line_id uuid REFERENCES quote_line(id),
  ADD COLUMN release_id uuid,
  ADD COLUMN release_part_id uuid,
  ADD COLUMN list_price_snapshot numeric(14,4),
  ADD COLUMN discount_rate_snapshot numeric(14,6);

ALTER TABLE commerce_order_line
  ADD CONSTRAINT commerce_order_line_source CHECK (
    price_source IS NULL OR price_source IN ('quote', 'catalogue')
  ),
  ADD CONSTRAINT commerce_order_line_quote_snapshot CHECK (
    price_source IS DISTINCT FROM 'quote' OR quote_line_id IS NOT NULL
  ),
  ADD CONSTRAINT commerce_order_line_catalogue_snapshot CHECK (
    price_source IS DISTINCT FROM 'catalogue'
    OR (release_id IS NOT NULL AND release_part_id IS NOT NULL AND list_price_snapshot IS NOT NULL AND discount_rate_snapshot IS NOT NULL)
  );

CREATE INDEX commerce_order_line_quote ON commerce_order_line (quote_line_id);
