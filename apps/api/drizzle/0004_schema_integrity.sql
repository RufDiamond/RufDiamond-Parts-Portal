ALTER TABLE "idempotency_record" DROP CONSTRAINT "idempotency_state";--> statement-breakpoint
ALTER TABLE "order_line" DROP CONSTRAINT "order_line_release_pair";--> statement-breakpoint
ALTER TABLE "order_line" DROP CONSTRAINT "order_line_release_id_release_part_id_release_part_release_id_id_fk";
--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "release_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line" ALTER COLUMN "release_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line" ALTER COLUMN "release_part_id" SET NOT NULL;--> statement-breakpoint
-- Candidate keys must exist before the composite foreign keys reference them.
ALTER TABLE "release_part" ADD CONSTRAINT "release_part_id_trace" UNIQUE("release_id","id","working_id");--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_id_release" UNIQUE("id","release_id");--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_variant_in_release" FOREIGN KEY ("release_id","variant_id") REFERENCES "public"."release_variant"("release_id","working_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_parent_release" FOREIGN KEY ("order_id","release_id") REFERENCES "public"."order"("id","release_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_released_part_trace" FOREIGN KEY ("release_id","release_part_id","part_id") REFERENCES "public"."release_part"("release_id","id","working_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_state" CHECK (("idempotency_record"."status" = 'in_progress' AND "idempotency_record"."response" IS NULL AND "idempotency_record"."response_status" IS NULL) OR ("idempotency_record"."status" = 'completed' AND "idempotency_record"."response" IS NOT NULL AND "idempotency_record"."response_status" IS NOT NULL AND "idempotency_record"."response_status" BETWEEN 100 AND 599));
--> statement-breakpoint
CREATE FUNCTION protect_import_staging_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.job_id, NEW.source_row_key, NEW.source_payload)
     IS DISTINCT FROM ROW(OLD.job_id, OLD.source_row_key, OLD.source_payload) THEN
    RAISE EXCEPTION 'Staging source identity and raw payload are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER import_staging_source_immutable BEFORE UPDATE ON import_staging_row
FOR EACH ROW EXECUTE FUNCTION protect_import_staging_source();
