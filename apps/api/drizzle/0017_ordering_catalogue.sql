CREATE TABLE ordering_catalogue_part (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  catalogue_key text NOT NULL,
  source_revision text NOT NULL CHECK(source_revision ~ '^[a-f0-9]{64}$'),
  part_number text NOT NULL,
  description text NOT NULL,
  currency text NOT NULL DEFAULT 'CAD' CHECK(currency IN ('CAD','USD')),
  list_price numeric(14,2) CHECK(list_price IS NULL OR list_price>=0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
ALTER TABLE ordering_catalogue_part ENABLE ROW LEVEL SECURITY;
CREATE POLICY ordering_catalogue_select ON ordering_catalogue_part FOR SELECT USING (true);
REVOKE ALL ON ordering_catalogue_part FROM PUBLIC;
DO $$
DECLARE browser_role text;
BEGIN
  FOR browser_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON ordering_catalogue_part FROM %I',browser_role);
  END LOOP;
END $$;
ALTER TABLE commerce_order_line
  ADD COLUMN ordering_catalogue_part_id uuid REFERENCES ordering_catalogue_part(id),
  ADD COLUMN catalogue_revision text,
  DROP CONSTRAINT commerce_order_line_source,
  ADD CONSTRAINT commerce_order_line_source CHECK(price_source IS NULL OR price_source IN ('quote','catalogue','supplier-catalogue')),
  ADD CONSTRAINT commerce_order_line_supplier_snapshot CHECK(
    price_source IS DISTINCT FROM 'supplier-catalogue' OR
    (ordering_catalogue_part_id IS NOT NULL AND catalogue_revision IS NOT NULL AND catalogue_revision ~ '^[a-f0-9]{64}$'
      AND list_price_snapshot IS NOT NULL AND discount_rate_snapshot IS NOT NULL)
  );
