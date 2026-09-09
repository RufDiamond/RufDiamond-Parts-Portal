CREATE TABLE "release_diagram_mapping" (
	"release_id" uuid NOT NULL,
	"figure_id" uuid NOT NULL,
	"drawing_id" uuid NOT NULL,
	"document" jsonb NOT NULL,
	"source_revision_id" uuid NOT NULL,
	"source_document_checksum" text NOT NULL,
	"reviewed_by_user_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "release_diagram_mapping_release_id_figure_id_pk" PRIMARY KEY("release_id","figure_id"),
	CONSTRAINT "release_diagram_mapping_document_object" CHECK (jsonb_typeof("release_diagram_mapping"."document") = 'object'),
	CONSTRAINT "sha256_format" CHECK ("release_diagram_mapping"."source_document_checksum" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "diagram_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"figure_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current_revision_id" uuid,
	CONSTRAINT "diagram_mapping_figure" UNIQUE("figure_id"),
	CONSTRAINT "diagram_mapping_version_positive" CHECK ("diagram_mapping"."version" > 0),
	CONSTRAINT "diagram_mapping_representable_state" CHECK (("diagram_mapping"."version" = 1 AND "diagram_mapping"."current_revision_id" IS NULL) OR ("diagram_mapping"."version" > 1 AND "diagram_mapping"."current_revision_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "diagram_mapping_approval" (
	"revision_id" uuid PRIMARY KEY NOT NULL,
	"document_checksum" text NOT NULL,
	"reviewed_by_user_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sha256_format" CHECK ("diagram_mapping_approval"."document_checksum" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "diagram_mapping_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"head_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"document" jsonb NOT NULL,
	"drawing_file_id" uuid NOT NULL,
	"drawing_sha256" text NOT NULL,
	"image_width" integer NOT NULL,
	"image_height" integer NOT NULL,
	"catalogue_binding_sha256" text NOT NULL,
	"document_checksum" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diagram_mapping_revision_number" UNIQUE("head_id","revision"),
	CONSTRAINT "diagram_mapping_revision_head_identity" UNIQUE("head_id","id"),
	CONSTRAINT "diagram_mapping_revision_checksum_identity" UNIQUE("id","document_checksum"),
	CONSTRAINT "diagram_mapping_revision_positive" CHECK ("diagram_mapping_revision"."revision" > 0),
	CONSTRAINT "diagram_mapping_revision_document_object" CHECK (jsonb_typeof("diagram_mapping_revision"."document") = 'object'),
	CONSTRAINT "diagram_mapping_revision_dimensions" CHECK ("diagram_mapping_revision"."image_width" > 0 AND "diagram_mapping_revision"."image_height" > 0),
	CONSTRAINT "diagram_mapping_revision_drawing_checksum" CHECK ("diagram_mapping_revision"."drawing_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "diagram_mapping_revision_catalogue_checksum" CHECK ("diagram_mapping_revision"."catalogue_binding_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "diagram_mapping_revision_document_checksum" CHECK ("diagram_mapping_revision"."document_checksum" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "release_diagram_mapping" ADD CONSTRAINT "release_diagram_mapping_release_id_publication_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."publication_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_diagram_mapping" ADD CONSTRAINT "release_diagram_mapping_release_id_figure_id_release_figure_release_id_id_fk" FOREIGN KEY ("release_id","figure_id") REFERENCES "public"."release_figure"("release_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_diagram_mapping" ADD CONSTRAINT "release_diagram_mapping_release_id_drawing_id_release_drawing_release_id_id_fk" FOREIGN KEY ("release_id","drawing_id") REFERENCES "public"."release_drawing"("release_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagram_mapping" ADD CONSTRAINT "diagram_mapping_figure_id_figure_id_fk" FOREIGN KEY ("figure_id") REFERENCES "public"."figure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagram_mapping" ADD CONSTRAINT "diagram_mapping_current_revision_same_head" FOREIGN KEY ("id","current_revision_id") REFERENCES "public"."diagram_mapping_revision"("head_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagram_mapping_approval" ADD CONSTRAINT "diagram_mapping_approval_reviewed_by_user_id_app_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagram_mapping_approval" ADD CONSTRAINT "diagram_mapping_approval_revision_checksum" FOREIGN KEY ("revision_id","document_checksum") REFERENCES "public"."diagram_mapping_revision"("id","document_checksum") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagram_mapping_revision" ADD CONSTRAINT "diagram_mapping_revision_head_id_diagram_mapping_id_fk" FOREIGN KEY ("head_id") REFERENCES "public"."diagram_mapping"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagram_mapping_revision" ADD CONSTRAINT "diagram_mapping_revision_drawing_file_id_drawing_file_id_fk" FOREIGN KEY ("drawing_file_id") REFERENCES "public"."drawing_file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagram_mapping_revision" ADD CONSTRAINT "diagram_mapping_revision_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Existing working figures begin in the only representable untouched state.
-- Source documents, approvals and customer snapshots are deliberately not inferred.
INSERT INTO public.diagram_mapping (figure_id)
SELECT id FROM public.figure
ON CONFLICT (figure_id) DO NOTHING;
--> statement-breakpoint
CREATE TRIGGER diagram_mapping_revision_append_only
BEFORE UPDATE OR DELETE ON public.diagram_mapping_revision
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_change();
--> statement-breakpoint
CREATE TRIGGER diagram_mapping_approval_append_only
BEFORE UPDATE OR DELETE ON public.diagram_mapping_approval
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_change();
--> statement-breakpoint
CREATE TRIGGER release_diagram_mapping_snapshot
BEFORE INSERT OR UPDATE OR DELETE ON public.release_diagram_mapping
FOR EACH ROW EXECUTE FUNCTION public.protect_release_snapshot();
--> statement-breakpoint
-- Draft geometry is backend-only even when provider defaults grant browser roles
-- access to newly created public-schema tables.
REVOKE ALL PRIVILEGES ON TABLE
  public.diagram_mapping,
  public.diagram_mapping_revision,
  public.diagram_mapping_approval,
  public.release_diagram_mapping
FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.diagram_mapping, public.diagram_mapping_revision, public.diagram_mapping_approval, public.release_diagram_mapping FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.diagram_mapping, public.diagram_mapping_revision, public.diagram_mapping_approval, public.release_diagram_mapping FROM authenticated';
  END IF;
END;
$$;
