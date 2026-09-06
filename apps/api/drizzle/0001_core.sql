-- Mutable working catalog. Foreign keys attach in migration 0003.
CREATE TABLE "callout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"figure_id" uuid NOT NULL,
	"figure_part_id" uuid,
	"source_key" text NOT NULL,
	"number" text NOT NULL,
	"x" numeric(7, 4),
	"y" numeric(7, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "callout_source_identity" UNIQUE("figure_id","source_key"),
	CONSTRAINT "version_positive" CHECK ("callout"."version" > 0),
	CONSTRAINT "callout_coordinates" CHECK (("callout"."x" IS NULL AND "callout"."y" IS NULL) OR ("callout"."x" IS NOT NULL AND "callout"."y" IS NOT NULL AND "callout"."x" BETWEEN 0 AND 100 AND "callout"."y" BETWEEN 0 AND 100))
);
--> statement-breakpoint
CREATE TABLE "drawing_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"media_type" text NOT NULL,
	"bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"pages" integer,
	"file_version" integer DEFAULT 1 NOT NULL,
	"validation_status" text DEFAULT 'pending' NOT NULL,
	"validation_report" jsonb,
	"preview_object_key" text,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drawing_file_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "drawing_file_preview_object_key_unique" UNIQUE("preview_object_key"),
	CONSTRAINT "sha256_format" CHECK ("drawing_file"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "drawing_dimensions" CHECK ("drawing_file"."bytes" > 0 AND "drawing_file"."file_version" > 0 AND ("drawing_file"."width" IS NULL OR "drawing_file"."width" > 0) AND ("drawing_file"."height" IS NULL OR "drawing_file"."height" > 0) AND ("drawing_file"."pages" IS NULL OR "drawing_file"."pages" > 0)),
	CONSTRAINT "drawing_validation" CHECK ("drawing_file"."validation_status" IN ('pending','valid','rejected'))
);
--> statement-breakpoint
CREATE TABLE "figure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"system_id" uuid NOT NULL,
	"name" text NOT NULL,
	"group_no" text,
	"drawing_file_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "figure_source_identity" UNIQUE("variant_id","source_key"),
	CONSTRAINT "version_positive" CHECK ("figure"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "figure_part" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"figure_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"source_row_key" text NOT NULL,
	"qty" integer NOT NULL,
	"remarks" text,
	"serviceable" boolean DEFAULT true NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "figure_part_id_figure" UNIQUE("id","figure_id"),
	CONSTRAINT "figure_part_source_identity" UNIQUE("figure_id","source_row_key"),
	CONSTRAINT "version_positive" CHECK ("figure_part"."version" > 0),
	CONSTRAINT "figure_part_qty_positive" CHECK ("figure_part"."qty" > 0),
	CONSTRAINT "figure_part_dates" CHECK ("figure_part"."effective_to" >= "figure_part"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "model" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_line_id" uuid NOT NULL,
	"name" text NOT NULL,
	"photo_file_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "model_line_name" UNIQUE("product_line_id","name"),
	CONSTRAINT "version_positive" CHECK ("model"."version" > 0),
	CONSTRAINT "model_lifecycle" CHECK ("model"."status" IN ('active','legacy','discontinued'))
);
--> statement-breakpoint
CREATE TABLE "model_system" (
	"model_id" uuid NOT NULL,
	"system_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "model_system_model_id_system_id_pk" PRIMARY KEY("model_id","system_id"),
	CONSTRAINT "version_positive" CHECK ("model_system"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "part" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_number" text NOT NULL,
	"normalized_part_number" text NOT NULL,
	"description" text NOT NULL,
	"manufacturer" text,
	"list_price" numeric(14, 2),
	"currency" text DEFAULT 'CAD' NOT NULL,
	"superseded_by_part_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "part_normalized_part_number_unique" UNIQUE("normalized_part_number"),
	CONSTRAINT "version_positive" CHECK ("part"."version" > 0),
	CONSTRAINT "currency_iso_code" CHECK ("part"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "part_price_nonnegative" CHECK ("part"."list_price" >= 0 AND "part"."list_price" < 'Infinity'::numeric),
	CONSTRAINT "part_status" CHECK ("part"."status" IN ('active','superseded','discontinued')),
	CONSTRAINT "part_no_self_supersession" CHECK ("part"."superseded_by_part_id" <> "part"."id"),
	CONSTRAINT "part_number_normalized" CHECK ("part"."normalized_part_number" = upper(btrim("part"."part_number")) AND "part"."normalized_part_number" <> '')
);
--> statement-breakpoint
CREATE TABLE "part_requires" (
	"part_id" uuid NOT NULL,
	"required_part_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"review_state" text DEFAULT 'pending' NOT NULL,
	"provenance" jsonb,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "part_requires_part_id_required_part_id_pk" PRIMARY KEY("part_id","required_part_id"),
	CONSTRAINT "version_positive" CHECK ("part_requires"."version" > 0),
	CONSTRAINT "requires_no_self" CHECK ("part_requires"."part_id" <> "part_requires"."required_part_id"),
	CONSTRAINT "requires_qty_positive" CHECK ("part_requires"."qty" > 0),
	CONSTRAINT "requires_review_state" CHECK ("part_requires"."review_state" IN ('pending','approved','rejected'))
);
--> statement-breakpoint
CREATE TABLE "product_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"manufacturer" text,
	"country" text,
	"is_distributed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "product_line_normalized_name_unique" UNIQUE("normalized_name"),
	CONSTRAINT "version_positive" CHECK ("product_line"."version" > 0),
	CONSTRAINT "product_line_normalized" CHECK ("product_line"."normalized_name" = lower(btrim("product_line"."name")) AND "product_line"."normalized_name" <> '')
);
--> statement-breakpoint
CREATE TABLE "system" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "system_normalized_name_unique" UNIQUE("normalized_name"),
	CONSTRAINT "version_positive" CHECK ("system"."version" > 0),
	CONSTRAINT "system_normalized" CHECK ("system"."normalized_name" = lower(btrim("system"."name")) AND "system"."normalized_name" <> '')
);
--> statement-breakpoint
CREATE TABLE "variant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"label" text NOT NULL,
	"serial_from" text,
	"serial_to" text,
	"catalog_revision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "variant_model_label" UNIQUE("model_id","label"),
	CONSTRAINT "variant_id_model" UNIQUE("id","model_id"),
	CONSTRAINT "version_positive" CHECK ("variant"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX "callout_figure_part" ON "callout" USING btree ("figure_part_id");
--> statement-breakpoint
CREATE INDEX "figure_variant_system" ON "figure" USING btree ("variant_id","system_id");
--> statement-breakpoint
CREATE INDEX "figure_part_part" ON "figure_part" USING btree ("part_id");
