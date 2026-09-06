-- Immutable customer graph. Foreign keys attach in migration 0003.
CREATE TABLE "publication_release" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"status" text DEFAULT 'building' NOT NULL,
	"summary" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"source_checksum" text NOT NULL,
	CONSTRAINT "release_model_revision" UNIQUE("model_id","revision"),
	CONSTRAINT "sha256_format" CHECK ("publication_release"."source_checksum" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "release_revision_positive" CHECK ("publication_release"."revision" > 0),
	CONSTRAINT "release_state" CHECK (("publication_release"."status" = 'building' AND "publication_release"."published_at" IS NULL) OR ("publication_release"."status" IN ('active','inactive') AND "publication_release"."published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "release_callout" (
	"release_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"working_id" uuid NOT NULL,
	"figure_id" uuid NOT NULL,
	"figure_part_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"number" text NOT NULL,
	"x" numeric(7, 4) NOT NULL,
	"y" numeric(7, 4) NOT NULL,
	CONSTRAINT "release_callout_release_id_id_pk" PRIMARY KEY("release_id","id"),
	CONSTRAINT "release_callout_source" UNIQUE("release_id","working_id"),
	CONSTRAINT "release_callout_row" UNIQUE("release_id","figure_id","source_key"),
	CONSTRAINT "release_callout_coordinates" CHECK ("release_callout"."x" BETWEEN 0 AND 100 AND "release_callout"."y" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "release_drawing" (
	"release_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"working_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"media_type" text NOT NULL,
	"bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"pages" integer,
	"file_version" integer DEFAULT 1 NOT NULL,
	"preview_object_key" text,
	CONSTRAINT "release_drawing_release_id_id_pk" PRIMARY KEY("release_id","id"),
	CONSTRAINT "release_drawing_source" UNIQUE("release_id","working_id"),
	CONSTRAINT "sha256_format" CHECK ("release_drawing"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "release_drawing_dimensions" CHECK ("release_drawing"."bytes" > 0 AND "release_drawing"."file_version" > 0 AND ("release_drawing"."width" IS NULL OR "release_drawing"."width" > 0) AND ("release_drawing"."height" IS NULL OR "release_drawing"."height" > 0) AND ("release_drawing"."pages" IS NULL OR "release_drawing"."pages" > 0))
);
--> statement-breakpoint
CREATE TABLE "release_figure" (
	"release_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"working_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"system_id" uuid NOT NULL,
	"drawing_id" uuid NOT NULL,
	"name" text NOT NULL,
	"group_no" text,
	"source_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "release_figure_release_id_id_pk" PRIMARY KEY("release_id","id"),
	CONSTRAINT "release_figure_source" UNIQUE("release_id","working_id")
);
--> statement-breakpoint
CREATE TABLE "release_figure_part" (
	"release_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"working_id" uuid NOT NULL,
	"figure_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"source_row_key" text NOT NULL,
	"qty" integer NOT NULL,
	"remarks" text,
	"serviceable" boolean DEFAULT true NOT NULL,
	"effective_from" date,
	"effective_to" date,
	CONSTRAINT "release_figure_part_release_id_id_pk" PRIMARY KEY("release_id","id"),
	CONSTRAINT "release_figure_part_source" UNIQUE("release_id","working_id"),
	CONSTRAINT "release_figure_part_figure" UNIQUE("release_id","id","figure_id"),
	CONSTRAINT "release_figure_part_row" UNIQUE("release_id","figure_id","source_row_key"),
	CONSTRAINT "release_figure_part_qty" CHECK ("release_figure_part"."qty" > 0),
	CONSTRAINT "release_figure_part_dates" CHECK ("release_figure_part"."effective_to" >= "release_figure_part"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "release_model" (
	"release_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"working_id" uuid NOT NULL,
	"product_line_id" uuid NOT NULL,
	"product_line_name" text NOT NULL,
	"manufacturer" text,
	"country" text,
	"is_distributed" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"photo_drawing_id" uuid,
	CONSTRAINT "release_model_release_id_id_pk" PRIMARY KEY("release_id","id"),
	CONSTRAINT "release_single_model" UNIQUE("release_id"),
	CONSTRAINT "release_model_lifecycle" CHECK ("release_model"."status" IN ('active','legacy','discontinued'))
);
--> statement-breakpoint
CREATE TABLE "release_part" (
	"release_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"working_id" uuid NOT NULL,
	"part_number" text NOT NULL,
	"description" text NOT NULL,
	"manufacturer" text,
	"list_price" numeric(14, 2),
	"currency" text NOT NULL,
	"superseded_by_part_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "release_part_release_id_id_pk" PRIMARY KEY("release_id","id"),
	CONSTRAINT "release_part_source" UNIQUE("release_id","working_id"),
	CONSTRAINT "currency_iso_code" CHECK ("release_part"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "release_part_price" CHECK ("release_part"."list_price" >= 0 AND "release_part"."list_price" < 'Infinity'::numeric),
	CONSTRAINT "release_part_status" CHECK ("release_part"."status" IN ('active','superseded','discontinued')),
	CONSTRAINT "release_part_no_self" CHECK ("release_part"."superseded_by_part_id" <> "release_part"."id")
);
--> statement-breakpoint
CREATE TABLE "release_part_requires" (
	"release_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"required_part_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	CONSTRAINT "release_part_requires_release_id_part_id_required_part_id_pk" PRIMARY KEY("release_id","part_id","required_part_id"),
	CONSTRAINT "release_requires_no_self" CHECK ("release_part_requires"."part_id" <> "release_part_requires"."required_part_id"),
	CONSTRAINT "release_requires_qty" CHECK ("release_part_requires"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "release_system" (
	"release_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"working_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "release_system_release_id_id_pk" PRIMARY KEY("release_id","id"),
	CONSTRAINT "release_system_source" UNIQUE("release_id","working_id")
);
--> statement-breakpoint
CREATE TABLE "release_variant" (
	"release_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"working_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"label" text NOT NULL,
	"serial_from" text,
	"serial_to" text,
	"catalog_revision" text,
	CONSTRAINT "release_variant_release_id_id_pk" PRIMARY KEY("release_id","id"),
	CONSTRAINT "release_variant_source" UNIQUE("release_id","working_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "release_one_active_per_model" ON "publication_release" USING btree ("model_id") WHERE "publication_release"."status" = 'active';
