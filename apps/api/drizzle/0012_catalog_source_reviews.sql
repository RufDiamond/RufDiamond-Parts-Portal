ALTER TABLE figure_part ADD COLUMN quantity_semantics text NOT NULL DEFAULT 'known', ALTER COLUMN qty DROP NOT NULL, DROP CONSTRAINT figure_part_qty_positive;
ALTER TABLE figure_part ADD CONSTRAINT figure_part_qty_positive CHECK ((quantity_semantics='known' AND qty IS NOT NULL AND qty>0) OR (quantity_semantics='unspecified-installed' AND qty IS NULL));
--> statement-breakpoint
CREATE TABLE import_quantity_review (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES import_job(id), staging_row_id uuid NOT NULL, staging_row_version integer NOT NULL,
 issue_id uuid NOT NULL REFERENCES import_issue(id), issue_version integer NOT NULL, source_binding_sha256 text NOT NULL, source jsonb NOT NULL, interpreted_fields jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES app_user(id), reviewer_name text NOT NULL, reviewed_at timestamptz NOT NULL, evidence text NOT NULL,
 UNIQUE(issue_id,issue_version), FOREIGN KEY(staging_row_id,job_id) REFERENCES import_staging_row(id,job_id),
 CHECK(staging_row_version>0 AND issue_version>0 AND source_binding_sha256 ~ '^[a-f0-9]{64}$' AND length(btrim(reviewer_name))>0 AND length(btrim(evidence)) BETWEEN 10 AND 4000
 AND interpreted_fields->>'quantitySemantics'='unspecified-installed' AND interpreted_fields->'qty'='null'::jsonb)
);
CREATE TRIGGER quantity_review_immutable BEFORE UPDATE OR DELETE ON import_quantity_review FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
--> statement-breakpoint
ALTER TABLE diagram_mapping ADD COLUMN source_review_version integer NOT NULL DEFAULT 1 CHECK(source_review_version>0);
CREATE TABLE catalog_depiction_review (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), figure_id uuid NOT NULL REFERENCES figure(id), review_version integer NOT NULL,
 source_binding_sha256 text NOT NULL, source jsonb NOT NULL, mode text NOT NULL, row_ids jsonb NOT NULL,
 quantity_decision_id uuid REFERENCES import_quantity_review(id), actor_id uuid NOT NULL REFERENCES app_user(id), reviewer_name text NOT NULL, reviewed_at timestamptz NOT NULL, evidence text NOT NULL,
 UNIQUE(figure_id,review_version), CHECK(review_version>0 AND source_binding_sha256 ~ '^[a-f0-9]{64}$' AND mode IN ('table-only','not-depicted','assembly-reference-unspecified') AND jsonb_typeof(row_ids)='array' AND jsonb_array_length(row_ids)>0 AND length(btrim(reviewer_name))>0 AND length(btrim(evidence)) BETWEEN 10 AND 4000 AND ((mode='assembly-reference-unspecified')=(quantity_decision_id IS NOT NULL)))
);
CREATE TRIGGER depiction_review_immutable BEFORE UPDATE OR DELETE ON catalog_depiction_review FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
--> statement-breakpoint
ALTER TABLE release_figure ADD COLUMN depiction_mode text NOT NULL DEFAULT 'physical', ALTER COLUMN drawing_id DROP NOT NULL;
ALTER TABLE release_figure ADD CONSTRAINT release_figure_depiction CHECK ((depiction_mode='physical' AND drawing_id IS NOT NULL) OR (depiction_mode='table-only' AND drawing_id IS NULL));
ALTER TABLE release_figure_part ADD COLUMN quantity_semantics text NOT NULL DEFAULT 'known', ALTER COLUMN qty DROP NOT NULL, DROP CONSTRAINT release_figure_part_qty;
ALTER TABLE release_figure_part ADD CONSTRAINT release_figure_part_qty CHECK ((quantity_semantics='known' AND qty IS NOT NULL AND qty>0) OR (quantity_semantics='unspecified-installed' AND qty IS NULL));
--> statement-breakpoint
CREATE TABLE release_depiction_review (
 release_id uuid NOT NULL REFERENCES publication_release(id), id uuid PRIMARY KEY DEFAULT gen_random_uuid(),figure_id uuid NOT NULL,row_ids jsonb NOT NULL,provenance jsonb NOT NULL,checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),
 UNIQUE(release_id,id),FOREIGN KEY(release_id,figure_id) REFERENCES release_figure(release_id,id)
);
CREATE TABLE release_source_reference (
 release_id uuid NOT NULL REFERENCES publication_release(id),id uuid PRIMARY KEY DEFAULT gen_random_uuid(),figure_id uuid NOT NULL,figure_part_id uuid NOT NULL,decision_id uuid NOT NULL,number text NOT NULL,source_callout_id uuid,
 FOREIGN KEY(release_id,figure_part_id,figure_id) REFERENCES release_figure_part(release_id,id,figure_id),FOREIGN KEY(release_id,decision_id) REFERENCES release_depiction_review(release_id,id)
);
CREATE TRIGGER release_depiction_snapshot BEFORE INSERT OR UPDATE OR DELETE ON release_depiction_review FOR EACH ROW EXECUTE FUNCTION protect_release_snapshot();
CREATE TRIGGER release_reference_snapshot BEFORE INSERT OR UPDATE OR DELETE ON release_source_reference FOR EACH ROW EXECUTE FUNCTION protect_release_snapshot();
