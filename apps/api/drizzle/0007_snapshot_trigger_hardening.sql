CREATE OR REPLACE FUNCTION public.protect_release_snapshot() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE parent_id uuid; sealed_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.release_id IS DISTINCT FROM OLD.release_id THEN
    RAISE EXCEPTION 'Snapshot rows cannot move between releases' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN parent_id := OLD.release_id; ELSE parent_id := NEW.release_id; END IF;
  -- Preserve the parent-row lock that serializes snapshot edits with activation.
  SELECT published_at INTO sealed_at
  FROM public.publication_release
  WHERE id = parent_id
  FOR UPDATE;
  IF sealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Published release snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.protect_order_line() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE parent_id uuid; submitted timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
    RAISE EXCEPTION 'Order lines cannot move between orders' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN parent_id := OLD.order_id; ELSE parent_id := NEW.order_id; END IF;
  -- Preserve the parent-row lock that serializes line edits with submission.
  SELECT submitted_at INTO submitted
  FROM public."order"
  WHERE id = parent_id
  FOR UPDATE;
  IF submitted IS NOT NULL THEN
    RAISE EXCEPTION 'Submitted order lines are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
