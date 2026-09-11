ALTER TABLE import_job ADD COLUMN lineage_key text, ADD COLUMN source_kind text, ADD COLUMN format text, ADD COLUMN source_bytes integer;
--> statement-breakpoint
ALTER TABLE import_job ADD CONSTRAINT import_source_metadata CHECK ((lineage_key IS NULL AND source_kind IS NULL AND format IS NULL AND source_bytes IS NULL) OR (lineage_key IS NOT NULL AND source_kind IS NOT NULL AND format IS NOT NULL AND source_bytes IS NOT NULL AND lineage_key ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$' AND source_kind IN ('workbook','legacy-draft','synthetic') AND format IN ('csv','xlsx') AND source_bytes BETWEEN 1 AND 26214400 AND object_version_id IS NOT NULL));
--> statement-breakpoint
CREATE TABLE import_source_alias (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES import_job(id), staging_row_id uuid NOT NULL UNIQUE,
 identity_key text NOT NULL, figure_key text NOT NULL, figure_id uuid NOT NULL REFERENCES figure(id), figure_part_id uuid NOT NULL, callout_id uuid REFERENCES callout(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(job_id,identity_key), FOREIGN KEY(staging_row_id,job_id) REFERENCES import_staging_row(id,job_id), FOREIGN KEY(figure_part_id,figure_id) REFERENCES figure_part(id,figure_id),
 CHECK(identity_key ~ '^[a-f0-9]{64}$' AND figure_key ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE import_issue_review (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), issue_id uuid NOT NULL REFERENCES import_issue(id), issue_version integer NOT NULL, decision text NOT NULL, evidence text NOT NULL,
 actor_id uuid NOT NULL REFERENCES app_user(id), reviewed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(issue_id,issue_version),
 CHECK(issue_version > 0 AND decision IN ('acknowledged','source-correction-required') AND length(btrim(evidence)) BETWEEN 10 AND 4000)
);
--> statement-breakpoint
CREATE TRIGGER import_alias_immutable BEFORE UPDATE OR DELETE ON import_source_alias FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER import_review_immutable BEFORE UPDATE OR DELETE ON import_issue_review FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE FUNCTION protect_canonical_import_normalization() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.import_job WHERE id=OLD.job_id AND source_kind IS NOT NULL) THEN
 RAISE EXCEPTION 'Canonical import staging is immutable; record a reviewed interpretation separately' USING ERRCODE='23514';
 END IF; RETURN NEW;
END; $$;
CREATE TRIGGER import_staging_immutable BEFORE UPDATE ON import_staging_row FOR EACH ROW EXECUTE FUNCTION protect_canonical_import_normalization();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_import_source() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
 IF ROW(NEW.id,NEW.model_id,NEW.variant_id,NEW.source_checksum,NEW.object_key,NEW.object_version_id,NEW.actor_id,NEW.created_at,NEW.filename,NEW.lineage_key,NEW.source_kind,NEW.format,NEW.source_bytes)
 IS DISTINCT FROM ROW(OLD.id,OLD.model_id,OLD.variant_id,OLD.source_checksum,OLD.object_key,OLD.object_version_id,OLD.actor_id,OLD.created_at,OLD.filename,OLD.lineage_key,OLD.source_kind,OLD.format,OLD.source_bytes) THEN
 RAISE EXCEPTION 'Import source and target identities are immutable' USING ERRCODE='23514'; END IF; RETURN NEW;
END; $$;
