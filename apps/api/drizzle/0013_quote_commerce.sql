-- Quote Status + commerce purchase orders (PPT commercial path).
CREATE SEQUENCE IF NOT EXISTS quote_reference_seq;
CREATE SEQUENCE IF NOT EXISTS commerce_order_reference_seq;

CREATE TABLE quote_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id),
  submitted_by_user_id uuid NOT NULL REFERENCES app_user(id),
  quote_no text NOT NULL,
  request_date date NOT NULL,
  product_line text NOT NULL,
  customer_name text NOT NULL,
  user_name text NOT NULL,
  requested jsonb,
  catalog_part_id uuid REFERENCES part(id),
  response_date date,
  available text,
  est_availability date,
  new_part_number text,
  new_description text,
  new_qty integer,
  factory_price numeric(14,4),
  customer_price numeric(14,4),
  comments text NOT NULL DEFAULT '',
  notify_customer boolean NOT NULL DEFAULT false,
  model text NOT NULL DEFAULT '—',
  serial_number text NOT NULL DEFAULT '—',
  system text NOT NULL DEFAULT '—',
  figure text NOT NULL DEFAULT '—',
  assembly_name text NOT NULL DEFAULT '—',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT quote_line_product_line CHECK (product_line IN ('Fat Truck','IronHorse','Agilis')),
  CONSTRAINT quote_line_available CHECK (available IS NULL OR available IN ('yes','partial','no')),
  CONSTRAINT quote_line_qty CHECK (new_qty IS NULL OR new_qty > 0),
  CONSTRAINT quote_line_prices CHECK (
    (factory_price IS NULL OR (factory_price >= 0 AND factory_price < 'Infinity'::numeric))
    AND (customer_price IS NULL OR (customer_price >= 0 AND customer_price < 'Infinity'::numeric))
  ),
  CONSTRAINT quote_line_version CHECK (version > 0),
  CONSTRAINT quote_line_requested CHECK (
    requested IS NULL OR (
      jsonb_typeof(requested) = 'object'
      AND requested ?& ARRAY['partNumber','description','qty']
    )
  )
);

CREATE INDEX quote_line_company_quote ON quote_line (company_id, quote_no, request_date DESC, id);
CREATE INDEX quote_line_admin_recent ON quote_line (request_date DESC, id);

CREATE TABLE quote_notice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id),
  customer_name text NOT NULL,
  quote_no text NOT NULL,
  line_ids uuid[] NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  seen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT quote_notice_lines CHECK (cardinality(line_ids) >= 1),
  CONSTRAINT quote_notice_version CHECK (version > 0)
);

CREATE INDEX quote_notice_company ON quote_notice (company_id, seen, at DESC);

CREATE TABLE commerce_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id),
  submitted_by_user_id uuid NOT NULL REFERENCES app_user(id),
  reference text NOT NULL UNIQUE,
  customer_po text NOT NULL,
  vin text NOT NULL,
  order_type text NOT NULL,
  schedule_date date,
  shipping_method text,
  shipping_address jsonb NOT NULL,
  billing_address jsonb NOT NULL,
  instructions text NOT NULL DEFAULT '',
  currency text NOT NULL,
  list_total numeric(14,2) NOT NULL,
  discount_rate numeric(8,4) NOT NULL DEFAULT 0,
  discount_applied numeric(14,2) NOT NULL,
  net_total numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT commerce_order_type CHECK (order_type IN ('regular','urgent','schedule')),
  CONSTRAINT commerce_order_status CHECK (status IN ('submitted','confirmed','fulfilled','cancelled')),
  CONSTRAINT commerce_order_shipping CHECK (
    shipping_method IS NULL OR shipping_method IN ('purolator-ground','purolator-express','manitoulin')
  ),
  CONSTRAINT commerce_order_amounts CHECK (
    list_total >= 0 AND discount_applied BETWEEN 0 AND list_total
    AND discount_rate BETWEEN 0 AND 1
    AND net_total = list_total - discount_applied
  ),
  CONSTRAINT commerce_order_schedule CHECK (
    (order_type = 'schedule' AND schedule_date IS NOT NULL)
    OR (order_type <> 'schedule' AND schedule_date IS NULL)
  ),
  CONSTRAINT commerce_order_version CHECK (version > 0)
);

CREATE INDEX commerce_order_company ON commerce_order (company_id, submitted_at DESC, id);

CREATE TABLE commerce_order_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES commerce_order(id) ON DELETE CASCADE,
  part_number text NOT NULL,
  description text NOT NULL,
  qty integer NOT NULL,
  unit_price numeric(14,4) NOT NULL,
  line_total numeric(14,2) NOT NULL,
  catalog_part_id uuid REFERENCES part(id),
  quote_no text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT commerce_order_line_qty CHECK (qty > 0),
  CONSTRAINT commerce_order_line_amounts CHECK (
    unit_price >= 0 AND line_total = round(qty * unit_price, 2)
  ),
  CONSTRAINT commerce_order_line_version CHECK (version > 0)
);

CREATE INDEX commerce_order_line_order ON commerce_order_line (order_id);

-- Runtime grants: mirror least-privilege pattern from prior migrations when roles exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ruf_app') THEN
    GRANT SELECT, INSERT, UPDATE ON quote_line, quote_notice, commerce_order, commerce_order_line TO ruf_app;
    GRANT USAGE, SELECT ON SEQUENCE quote_reference_seq, commerce_order_reference_seq TO ruf_app;
  END IF;
END $$;
