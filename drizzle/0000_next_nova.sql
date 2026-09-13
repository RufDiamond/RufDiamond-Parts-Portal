CREATE TYPE "public"."callout_source" AS ENUM('imported', 'vision', 'manual');--> statement-breakpoint
CREATE TYPE "public"."catalog_state" AS ENUM('live', 'draft', 'awaiting-import', 'not-registered');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('CAD', 'USD');--> statement-breakpoint
CREATE TYPE "public"."extraction_row_status" AS ENUM('pending', 'accepted', 'corrected', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."figure_status" AS ENUM('published', 'draft', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."import_run_kind" AS ENUM('reference', 'figures', 'plates', 'parts-tables', 'callouts', 'prices');--> statement-breakpoint
CREATE TYPE "public"."import_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."model_status" AS ENUM('active', 'legacy', 'discontinued');--> statement-breakpoint
CREATE TYPE "public"."part_status" AS ENUM('active', 'superseded', 'obsolete', 'special-order');--> statement-breakpoint
CREATE TABLE "callout" (
	"id" text PRIMARY KEY NOT NULL,
	"figure_id" text NOT NULL,
	"figure_part_id" text,
	"number" integer NOT NULL,
	"x" real,
	"y" real,
	"source" "callout_source" DEFAULT 'manual' NOT NULL,
	"confidence" real,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" text
);
--> statement-breakpoint
CREATE TABLE "drawing_file" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"format" text NOT NULL,
	"storage_path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"checksum" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_row" (
	"id" text PRIMARY KEY NOT NULL,
	"import_run_id" text NOT NULL,
	"figure_id" text,
	"source_page" integer,
	"row_image_path" text,
	"raw_item_no" text,
	"raw_part_number" text,
	"raw_description" text,
	"raw_qty" text,
	"raw_notes" text,
	"confidence" real,
	"status" "extraction_row_status" DEFAULT 'pending' NOT NULL,
	"corrected_json" text,
	"rejection_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"figure_part_id" text
);
--> statement-breakpoint
CREATE TABLE "figure" (
	"id" text PRIMARY KEY NOT NULL,
	"variant_id" text NOT NULL,
	"system_id" text NOT NULL,
	"group_no" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "figure_status" DEFAULT 'draft' NOT NULL,
	"drawing_file_id" text,
	"option_part_id" text,
	"footnote" text,
	"source_page" integer,
	CONSTRAINT "figure_variant_group_no" UNIQUE("variant_id","group_no")
);
--> statement-breakpoint
CREATE TABLE "figure_part" (
	"id" text PRIMARY KEY NOT NULL,
	"figure_id" text NOT NULL,
	"part_id" text NOT NULL,
	"item_no" integer NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"remarks" text,
	"shown" boolean DEFAULT true NOT NULL,
	"option_part_id" text,
	"notes_truncated" boolean DEFAULT false NOT NULL,
	"serviceable" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	CONSTRAINT "figure_part_figure_item_no" UNIQUE("figure_id","item_no")
);
--> statement-breakpoint
CREATE TABLE "figure_reference" (
	"from_figure_id" text NOT NULL,
	"to_figure_id" text NOT NULL,
	"note" text,
	CONSTRAINT "figure_reference_from_figure_id_to_figure_id_pk" PRIMARY KEY("from_figure_id","to_figure_id")
);
--> statement-breakpoint
CREATE TABLE "import_run" (
	"id" text PRIMARY KEY NOT NULL,
	"source_file" text NOT NULL,
	"source_checksum" text NOT NULL,
	"kind" "import_run_kind" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "import_run_status" DEFAULT 'running' NOT NULL,
	"summary" text,
	"actor_user_id" text
);
--> statement-breakpoint
CREATE TABLE "model" (
	"id" text PRIMARY KEY NOT NULL,
	"product_line_id" text NOT NULL,
	"name" text NOT NULL,
	"display_photo" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "model_status" NOT NULL,
	"catalog_state" "catalog_state" NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "model_system" (
	"model_id" text NOT NULL,
	"system_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "model_system_model_id_system_id_pk" PRIMARY KEY("model_id","system_id")
);
--> statement-breakpoint
CREATE TABLE "part" (
	"id" text PRIMARY KEY NOT NULL,
	"part_number" text NOT NULL,
	"description" text NOT NULL,
	"manufacturer" text,
	"list_price" numeric(12, 2),
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"superseded_by_part_id" text,
	"status" "part_status" DEFAULT 'active' NOT NULL,
	CONSTRAINT "part_part_number_unique" UNIQUE("part_number")
);
--> statement-breakpoint
CREATE TABLE "part_kit" (
	"kit_part_id" text NOT NULL,
	"member_part_id" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "part_kit_kit_part_id_member_part_id_pk" PRIMARY KEY("kit_part_id","member_part_id")
);
--> statement-breakpoint
CREATE TABLE "part_requires" (
	"part_id" text NOT NULL,
	"required_part_id" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "part_requires_part_id_required_part_id_pk" PRIMARY KEY("part_id","required_part_id")
);
--> statement-breakpoint
CREATE TABLE "product_line" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"manufacturer" text NOT NULL,
	"country" text NOT NULL,
	"is_distributed" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system" (
	"id" text PRIMARY KEY NOT NULL,
	"code" integer NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "system_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "variant" (
	"id" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"label" text NOT NULL,
	"serial_from" text,
	"serial_to" text,
	"catalog_revision" text NOT NULL,
	"doc_number" text,
	"edition" text,
	"published_year" integer
);
--> statement-breakpoint
ALTER TABLE "callout" ADD CONSTRAINT "callout_figure_id_figure_id_fk" FOREIGN KEY ("figure_id") REFERENCES "public"."figure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callout" ADD CONSTRAINT "callout_figure_part_id_figure_part_id_fk" FOREIGN KEY ("figure_part_id") REFERENCES "public"."figure_part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_row" ADD CONSTRAINT "extraction_row_import_run_id_import_run_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."import_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_row" ADD CONSTRAINT "extraction_row_figure_id_figure_id_fk" FOREIGN KEY ("figure_id") REFERENCES "public"."figure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_row" ADD CONSTRAINT "extraction_row_figure_part_id_figure_part_id_fk" FOREIGN KEY ("figure_part_id") REFERENCES "public"."figure_part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure" ADD CONSTRAINT "figure_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure" ADD CONSTRAINT "figure_system_id_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."system"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure" ADD CONSTRAINT "figure_drawing_file_id_drawing_file_id_fk" FOREIGN KEY ("drawing_file_id") REFERENCES "public"."drawing_file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure" ADD CONSTRAINT "figure_option_part_id_part_id_fk" FOREIGN KEY ("option_part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_part" ADD CONSTRAINT "figure_part_figure_id_figure_id_fk" FOREIGN KEY ("figure_id") REFERENCES "public"."figure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_part" ADD CONSTRAINT "figure_part_part_id_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_part" ADD CONSTRAINT "figure_part_option_part_id_part_id_fk" FOREIGN KEY ("option_part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_reference" ADD CONSTRAINT "figure_reference_from_figure_id_figure_id_fk" FOREIGN KEY ("from_figure_id") REFERENCES "public"."figure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_reference" ADD CONSTRAINT "figure_reference_to_figure_id_figure_id_fk" FOREIGN KEY ("to_figure_id") REFERENCES "public"."figure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model" ADD CONSTRAINT "model_product_line_id_product_line_id_fk" FOREIGN KEY ("product_line_id") REFERENCES "public"."product_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_system" ADD CONSTRAINT "model_system_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_system" ADD CONSTRAINT "model_system_system_id_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."system"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part" ADD CONSTRAINT "part_superseded_by_part_id_part_id_fk" FOREIGN KEY ("superseded_by_part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_kit" ADD CONSTRAINT "part_kit_kit_part_id_part_id_fk" FOREIGN KEY ("kit_part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_kit" ADD CONSTRAINT "part_kit_member_part_id_part_id_fk" FOREIGN KEY ("member_part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requires" ADD CONSTRAINT "part_requires_part_id_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requires" ADD CONSTRAINT "part_requires_required_part_id_part_id_fk" FOREIGN KEY ("required_part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant" ADD CONSTRAINT "variant_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "callout_figure_idx" ON "callout" USING btree ("figure_id");--> statement-breakpoint
CREATE INDEX "callout_figure_part_idx" ON "callout" USING btree ("figure_part_id");--> statement-breakpoint
CREATE INDEX "extraction_row_run_idx" ON "extraction_row" USING btree ("import_run_id");--> statement-breakpoint
CREATE INDEX "extraction_row_status_idx" ON "extraction_row" USING btree ("status");--> statement-breakpoint
CREATE INDEX "figure_part_figure_idx" ON "figure_part" USING btree ("figure_id");--> statement-breakpoint
CREATE INDEX "figure_part_part_idx" ON "figure_part" USING btree ("part_id");