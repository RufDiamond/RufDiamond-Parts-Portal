CREATE TABLE account_invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX account_invitation_user ON account_invitation(user_id);
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE public.account_invitation FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=browser_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.account_invitation FROM %I',browser_role);
    END IF;
  END LOOP;
END;
$$;
--> statement-breakpoint
-- Pilot customers need the read capabilities already required by the web boundary.
INSERT INTO role_capability(role_id,capability_key)
SELECT r.id,c.key FROM role r CROSS JOIN capability c
WHERE r.key IN ('purchaser','technician')
AND c.key IN ('catalog.model.view','catalog.figure.view','parts.record.view')
ON CONFLICT(role_id,capability_key) DO NOTHING;
