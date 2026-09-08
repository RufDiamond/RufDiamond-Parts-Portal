CREATE SEQUENCE "public"."rfq_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "callout" ADD COLUMN "mask_path" text;--> statement-breakpoint
ALTER TABLE "drawing_file" ADD COLUMN "object_version_id" text;--> statement-breakpoint
ALTER TABLE "drawing_file" ADD COLUMN "preview_object_version_id" text;--> statement-breakpoint
ALTER TABLE "drawing_file" ADD COLUMN "preview_sha256" text;--> statement-breakpoint
ALTER TABLE "drawing_file" ADD COLUMN "preview_bytes" bigint;--> statement-breakpoint
ALTER TABLE "drawing_file" ADD COLUMN "preview_width" integer;--> statement-breakpoint
ALTER TABLE "drawing_file" ADD COLUMN "preview_height" integer;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "login_id" text;--> statement-breakpoint
-- Existing canonical emails are the only safe login identifier backfill. Password
-- hashes remain unchanged; this migration never creates or imports passwords.
UPDATE "app_user" SET "login_id" = lower(btrim("email"));--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "login_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "default_shipping_address" text;--> statement-breakpoint
ALTER TABLE "release_callout" ADD COLUMN "mask_path" text;--> statement-breakpoint
ALTER TABLE "release_drawing" ADD COLUMN "object_version_id" text;--> statement-breakpoint
ALTER TABLE "release_drawing" ADD COLUMN "preview_object_version_id" text;--> statement-breakpoint
ALTER TABLE "release_drawing" ADD COLUMN "preview_sha256" text;--> statement-breakpoint
ALTER TABLE "release_drawing" ADD COLUMN "preview_bytes" bigint;--> statement-breakpoint
ALTER TABLE "release_drawing" ADD COLUMN "preview_width" integer;--> statement-breakpoint
ALTER TABLE "release_drawing" ADD COLUMN "preview_height" integer;--> statement-breakpoint
ALTER TABLE "import_job" ADD COLUMN "object_version_id" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "customer_reference" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "details_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "context_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "order_line" ADD COLUMN "comment_snapshot" text;--> statement-breakpoint
-- Never rewrite historical RFQ references to make the new invariant fit. Report
-- every conflict so an operator can resolve source data explicitly.
DO $$
DECLARE duplicate_references text;
BEGIN
  SELECT string_agg(format('%s (%s rows)', duplicate_reference, duplicate_count), ', ' ORDER BY duplicate_reference)
    INTO duplicate_references
  FROM (
    SELECT reference AS duplicate_reference, count(*) AS duplicate_count
    FROM "order"
    WHERE reference IS NOT NULL
    GROUP BY reference
    HAVING count(*) > 1
  ) conflicts;

  IF duplicate_references IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot create unique RFQ references: duplicate RFQ references found: %', duplicate_references
      USING ERRCODE = '23505', DETAIL = 'Resolve the listed historical references explicitly, then retry migration 0006.';
  END IF;
END;
$$;--> statement-breakpoint
CREATE UNIQUE INDEX "order_reference_unique" ON "order" USING btree ("reference") WHERE "order"."reference" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_login_id_unique" UNIQUE("login_id");--> statement-breakpoint
ALTER TABLE "drawing_file" ADD CONSTRAINT "drawing_object_versions" CHECK (("drawing_file"."object_version_id" IS NULL OR length(btrim("drawing_file"."object_version_id")) > 0) AND ("drawing_file"."preview_object_version_id" IS NULL OR length(btrim("drawing_file"."preview_object_version_id")) > 0));--> statement-breakpoint
ALTER TABLE "drawing_file" ADD CONSTRAINT "drawing_preview_metadata" CHECK (("drawing_file"."preview_sha256" IS NULL OR "drawing_file"."preview_sha256" ~ '^[a-f0-9]{64}$') AND ("drawing_file"."preview_bytes" IS NULL OR "drawing_file"."preview_bytes" > 0) AND ("drawing_file"."preview_width" IS NULL OR "drawing_file"."preview_width" > 0) AND ("drawing_file"."preview_height" IS NULL OR "drawing_file"."preview_height" > 0));--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "user_login_id_canonical" CHECK ("app_user"."login_id" = lower(btrim("app_user"."login_id")) AND "app_user"."login_id" <> '');--> statement-breakpoint
ALTER TABLE "release_drawing" ADD CONSTRAINT "release_drawing_object_versions" CHECK (("release_drawing"."object_version_id" IS NULL OR length(btrim("release_drawing"."object_version_id")) > 0) AND ("release_drawing"."preview_object_version_id" IS NULL OR length(btrim("release_drawing"."preview_object_version_id")) > 0));--> statement-breakpoint
ALTER TABLE "release_drawing" ADD CONSTRAINT "release_drawing_preview_metadata" CHECK (("release_drawing"."preview_sha256" IS NULL OR "release_drawing"."preview_sha256" ~ '^[a-f0-9]{64}$') AND ("release_drawing"."preview_bytes" IS NULL OR "release_drawing"."preview_bytes" > 0) AND ("release_drawing"."preview_width" IS NULL OR "release_drawing"."preview_width" > 0) AND ("release_drawing"."preview_height" IS NULL OR "release_drawing"."preview_height" > 0));--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_object_version" CHECK ("import_job"."object_version_id" IS NULL OR length(btrim("import_job"."object_version_id")) > 0);--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_context_snapshot" CHECK ("order"."context_snapshot" IS NULL OR (
    jsonb_typeof("order"."context_snapshot") = 'object'
    AND "order"."context_snapshot" ?& ARRAY['companyName','companyAddress','productLineName','modelName','serialLabel']
    AND ("order"."context_snapshot" - ARRAY['companyName','companyAddress','productLineName','modelName','serialLabel']) = '{}'::jsonb
    AND jsonb_typeof("order"."context_snapshot"->'companyName') = 'string'
    AND jsonb_typeof("order"."context_snapshot"->'companyAddress') IN ('string','null')
    AND jsonb_typeof("order"."context_snapshot"->'productLineName') = 'string'
    AND jsonb_typeof("order"."context_snapshot"->'modelName') = 'string'
    AND jsonb_typeof("order"."context_snapshot"->'serialLabel') = 'string'
  ));--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_import_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.model_id,NEW.variant_id,NEW.source_checksum,NEW.object_key,NEW.object_version_id,NEW.actor_id,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.model_id,OLD.variant_id,OLD.source_checksum,OLD.object_key,OLD.object_version_id,OLD.actor_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Import source and target identities are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
