-- Identity and operations; attach all FKs after every domain table exists.
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email"),
	CONSTRAINT "version_positive" CHECK ("app_user"."version" > 0),
	CONSTRAINT "user_email_canonical" CHECK ("app_user"."email" = lower(btrim("app_user"."email")) AND position('@' IN "app_user"."email") > 1),
	CONSTRAINT "user_status" CHECK ("app_user"."status" IN ('active','suspended','invited','disabled'))
);
--> statement-breakpoint
CREATE TABLE "capability" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'customer' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"discount_rate" numeric(7, 6) DEFAULT '0' NOT NULL,
	"price_tier_id" uuid,
	"technician_pricing_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "version_positive" CHECK ("company"."version" > 0),
	CONSTRAINT "company_type" CHECK ("company"."type" IN ('customer','dealer','internal')),
	CONSTRAINT "company_status" CHECK ("company"."status" IN ('active','suspended','inactive')),
	CONSTRAINT "company_discount_range" CHECK ("company"."discount_rate" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "company_machine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"unit_reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "company_machine_unit" UNIQUE("company_id","unit_reference"),
	CONSTRAINT "version_positive" CHECK ("company_machine"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "company_product_line" (
	"company_id" uuid NOT NULL,
	"product_line_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "company_product_line_company_id_product_line_id_pk" PRIMARY KEY("company_id","product_line_id"),
	CONSTRAINT "version_positive" CHECK ("company_product_line"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "dealer_customer_scope" (
	"dealer_company_id" uuid NOT NULL,
	"customer_company_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "dealer_customer_scope_dealer_company_id_customer_company_id_pk" PRIMARY KEY("dealer_company_id","customer_company_id"),
	CONSTRAINT "version_positive" CHECK ("dealer_customer_scope"."version" > 0),
	CONSTRAINT "dealer_customer_distinct" CHECK ("dealer_customer_scope"."dealer_company_id" <> "dealer_customer_scope"."customer_company_id")
);
--> statement-breakpoint
CREATE TABLE "password_reset_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "password_reset_token_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "version_positive" CHECK ("password_reset_token"."version" > 0),
	CONSTRAINT "reset_expiry" CHECK ("password_reset_token"."expires_at" > "password_reset_token"."created_at")
);
--> statement-breakpoint
CREATE TABLE "price_tier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"discount_rate" numeric(7, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "price_tier_key_unique" UNIQUE("key"),
	CONSTRAINT "version_positive" CHECK ("price_tier"."version" > 0),
	CONSTRAINT "tier_discount_range" CHECK ("price_tier"."discount_rate" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "role_key_unique" UNIQUE("key"),
	CONSTRAINT "version_positive" CHECK ("role"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "role_capability" (
	"role_id" uuid NOT NULL,
	"capability_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "role_capability_role_id_capability_key_pk" PRIMARY KEY("role_id","capability_key"),
	CONSTRAINT "version_positive" CHECK ("role_capability"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"csrf_token_hash" text NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "session_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "version_positive" CHECK ("session"."version" > 0),
	CONSTRAINT "session_expiry" CHECK ("session"."expires_at" > "session"."created_at" AND "session"."idle_expires_at" <= "session"."expires_at")
);
--> statement-breakpoint
CREATE TABLE "user_account_scope" (
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "user_account_scope_user_id_company_id_pk" PRIMARY KEY("user_id","company_id"),
	CONSTRAINT "version_positive" CHECK ("user_account_scope"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_capability" (
	"user_id" uuid NOT NULL,
	"capability_key" text NOT NULL,
	"granted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "user_capability_user_id_capability_key_pk" PRIMARY KEY("user_id","capability_key"),
	CONSTRAINT "version_positive" CHECK ("user_capability"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_fleet_scope" (
	"user_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "user_fleet_scope_user_id_variant_id_pk" PRIMARY KEY("user_id","variant_id"),
	CONSTRAINT "version_positive" CHECK ("user_fleet_scope"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_product_line_scope" (
	"user_id" uuid NOT NULL,
	"product_line_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "user_product_line_scope_user_id_product_line_id_pk" PRIMARY KEY("user_id","product_line_id"),
	CONSTRAINT "version_positive" CHECK ("user_product_line_scope"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_scope" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"brand_mode" text DEFAULT 'company' NOT NULL,
	"account_mode" text DEFAULT 'own' NOT NULL,
	"fleet_mode" text DEFAULT 'company' NOT NULL,
	"environment" text DEFAULT 'published' NOT NULL,
	"price_tier_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "version_positive" CHECK ("user_scope"."version" > 0),
	CONSTRAINT "scope_brand_mode" CHECK ("user_scope"."brand_mode" IN ('company','all','subset')),
	CONSTRAINT "scope_account_mode" CHECK ("user_scope"."account_mode" IN ('own','all','subset')),
	CONSTRAINT "scope_fleet_mode" CHECK ("user_scope"."fleet_mode" IN ('company','all','subset')),
	CONSTRAINT "scope_environment" CHECK ("user_scope"."environment" IN ('published','published_and_draft'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"effective_company_id" uuid,
	"capability" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid NOT NULL,
	"before_patch" jsonb,
	"after_patch" jsonb,
	"request_id" text NOT NULL,
	"correlation_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "idempotency_record" (
	"actor_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"response" jsonb,
	"response_status" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "idempotency_record_actor_id_operation_key_pk" PRIMARY KEY("actor_id","operation","key"),
	CONSTRAINT "version_positive" CHECK ("idempotency_record"."version" > 0),
	CONSTRAINT "sha256_format" CHECK ("idempotency_record"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "idempotency_key_nonempty" CHECK (length("idempotency_record"."operation") > 0 AND length("idempotency_record"."key") BETWEEN 1 AND 255),
	CONSTRAINT "idempotency_state" CHECK (("idempotency_record"."status" = 'in_progress' AND "idempotency_record"."response" IS NULL AND "idempotency_record"."response_status" IS NULL) OR ("idempotency_record"."status" = 'completed' AND "idempotency_record"."response" IS NOT NULL AND "idempotency_record"."response_status" BETWEEN 100 AND 599))
);
--> statement-breakpoint
CREATE TABLE "import_issue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"staging_row_id" uuid,
	"severity" text NOT NULL,
	"code" text NOT NULL,
	"field" text,
	"message" text NOT NULL,
	"details" jsonb,
	"resolution" jsonb,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "version_positive" CHECK ("import_issue"."version" > 0),
	CONSTRAINT "import_issue_severity" CHECK ("import_issue"."severity" IN ('warning','error'))
);
--> statement-breakpoint
CREATE TABLE "import_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"source_checksum" text NOT NULL,
	"object_key" text NOT NULL,
	"filename" text,
	"state" text DEFAULT 'uploaded' NOT NULL,
	"summary" jsonb,
	"actor_id" uuid NOT NULL,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "import_job_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "import_source_target" UNIQUE("variant_id","source_checksum"),
	CONSTRAINT "version_positive" CHECK ("import_job"."version" > 0),
	CONSTRAINT "sha256_format" CHECK ("import_job"."source_checksum" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "import_state" CHECK ("import_job"."state" IN ('uploaded','staged','validated','applying','applied','failed'))
);
--> statement-breakpoint
CREATE TABLE "import_staging_row" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"source_row_key" text NOT NULL,
	"row_number" integer,
	"source_payload" jsonb NOT NULL,
	"normalized_fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "staging_source_identity" UNIQUE("job_id","source_row_key"),
	CONSTRAINT "staging_id_job" UNIQUE("id","job_id"),
	CONSTRAINT "version_positive" CHECK ("import_staging_row"."version" > 0),
	CONSTRAINT "staging_row_number" CHECK ("import_staging_row"."row_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"dealer_company_id" uuid,
	"variant_id" uuid NOT NULL,
	"release_id" uuid,
	"reference" text,
	"kind" text DEFAULT 'request_for_quote' NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"currency" text NOT NULL,
	"list_total" numeric(14, 2) NOT NULL,
	"discount_rate" numeric(7, 6) DEFAULT '0' NOT NULL,
	"discount_applied" numeric(14, 2) NOT NULL,
	"net_total" numeric(14, 2) NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "version_positive" CHECK ("order"."version" > 0),
	CONSTRAINT "currency_iso_code" CHECK ("order"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "order_kind" CHECK ("order"."kind" = 'request_for_quote'),
	CONSTRAINT "order_status" CHECK ("order"."status" IN ('submitted','quoted','confirmed','fulfilled','cancelled')),
	CONSTRAINT "order_amounts" CHECK ("order"."list_total" >= 0 AND "order"."list_total" < 'Infinity'::numeric AND "order"."discount_applied" BETWEEN 0 AND "order"."list_total" AND "order"."discount_rate" BETWEEN 0 AND 1 AND "order"."net_total" = "order"."list_total" - "order"."discount_applied")
);
--> statement-breakpoint
CREATE TABLE "order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"release_id" uuid,
	"release_part_id" uuid,
	"part_number_snapshot" text NOT NULL,
	"description_snapshot" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_snapshot" numeric(14, 2) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "version_positive" CHECK ("order_line"."version" > 0),
	CONSTRAINT "order_line_release_pair" CHECK (("order_line"."release_id" IS NULL) = ("order_line"."release_part_id" IS NULL)),
	CONSTRAINT "order_line_amounts" CHECK ("order_line"."qty" > 0 AND "order_line"."unit_price_snapshot" >= 0 AND "order_line"."unit_price_snapshot" < 'Infinity'::numeric AND "order_line"."line_total" = round("order_line"."qty" * "order_line"."unit_price_snapshot",2))
);
--> statement-breakpoint
CREATE TABLE "outbox_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"deduplication_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "outbox_event_deduplication_key_unique" UNIQUE("deduplication_key"),
	CONSTRAINT "version_positive" CHECK ("outbox_event"."version" > 0),
	CONSTRAINT "outbox_attempts" CHECK ("outbox_event"."attempts" >= 0 AND "outbox_event"."payload_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "callout" ADD CONSTRAINT "callout_figure_id_figure_id_fk" FOREIGN KEY ("figure_id") REFERENCES "public"."figure"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "callout" ADD CONSTRAINT "callout_same_figure" FOREIGN KEY ("figure_part_id","figure_id") REFERENCES "public"."figure_part"("id","figure_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "drawing_file" ADD CONSTRAINT "drawing_file_uploaded_by_user_id_app_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "figure" ADD CONSTRAINT "figure_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "figure" ADD CONSTRAINT "figure_system_id_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."system"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "figure" ADD CONSTRAINT "figure_drawing_file_id_drawing_file_id_fk" FOREIGN KEY ("drawing_file_id") REFERENCES "public"."drawing_file"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "figure_part" ADD CONSTRAINT "figure_part_figure_id_figure_id_fk" FOREIGN KEY ("figure_id") REFERENCES "public"."figure"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "figure_part" ADD CONSTRAINT "figure_part_part_id_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "model" ADD CONSTRAINT "model_product_line_id_product_line_id_fk" FOREIGN KEY ("product_line_id") REFERENCES "public"."product_line"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "model" ADD CONSTRAINT "model_photo_file_id_drawing_file_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."drawing_file"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "model_system" ADD CONSTRAINT "model_system_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "model_system" ADD CONSTRAINT "model_system_system_id_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."system"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "part" ADD CONSTRAINT "part_superseded_by_part_id_part_id_fk" FOREIGN KEY ("superseded_by_part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "part_requires" ADD CONSTRAINT "part_requires_part_id_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "part_requires" ADD CONSTRAINT "part_requires_required_part_id_part_id_fk" FOREIGN KEY ("required_part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "part_requires" ADD CONSTRAINT "part_requires_reviewed_by_user_id_app_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "variant" ADD CONSTRAINT "variant_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_price_tier_id_price_tier_id_fk" FOREIGN KEY ("price_tier_id") REFERENCES "public"."price_tier"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_machine" ADD CONSTRAINT "company_machine_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_machine" ADD CONSTRAINT "company_machine_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_product_line" ADD CONSTRAINT "company_product_line_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_product_line" ADD CONSTRAINT "company_product_line_product_line_id_product_line_id_fk" FOREIGN KEY ("product_line_id") REFERENCES "public"."product_line"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dealer_customer_scope" ADD CONSTRAINT "dealer_customer_scope_dealer_company_id_company_id_fk" FOREIGN KEY ("dealer_company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dealer_customer_scope" ADD CONSTRAINT "dealer_customer_scope_customer_company_id_company_id_fk" FOREIGN KEY ("customer_company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "role_capability" ADD CONSTRAINT "role_capability_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "role_capability" ADD CONSTRAINT "role_capability_capability_key_capability_key_fk" FOREIGN KEY ("capability_key") REFERENCES "public"."capability"("key") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_account_scope" ADD CONSTRAINT "user_account_scope_user_id_user_scope_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_scope"("user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_account_scope" ADD CONSTRAINT "user_account_scope_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_capability" ADD CONSTRAINT "user_capability_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_capability" ADD CONSTRAINT "user_capability_capability_key_capability_key_fk" FOREIGN KEY ("capability_key") REFERENCES "public"."capability"("key") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_capability" ADD CONSTRAINT "user_capability_granted_by_user_id_app_user_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_fleet_scope" ADD CONSTRAINT "user_fleet_scope_user_id_user_scope_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_scope"("user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_fleet_scope" ADD CONSTRAINT "user_fleet_scope_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_product_line_scope" ADD CONSTRAINT "user_product_line_scope_user_id_user_scope_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_scope"("user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_product_line_scope" ADD CONSTRAINT "user_product_line_scope_product_line_id_product_line_id_fk" FOREIGN KEY ("product_line_id") REFERENCES "public"."product_line"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_scope" ADD CONSTRAINT "user_scope_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_scope" ADD CONSTRAINT "user_scope_price_tier_id_price_tier_id_fk" FOREIGN KEY ("price_tier_id") REFERENCES "public"."price_tier"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "publication_release" ADD CONSTRAINT "publication_release_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "publication_release" ADD CONSTRAINT "publication_release_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_callout" ADD CONSTRAINT "release_callout_release_id_publication_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."publication_release"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_callout" ADD CONSTRAINT "release_callout_release_id_figure_id_release_figure_release_id_id_fk" FOREIGN KEY ("release_id","figure_id") REFERENCES "public"."release_figure"("release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_callout" ADD CONSTRAINT "release_callout_same_figure" FOREIGN KEY ("release_id","figure_part_id","figure_id") REFERENCES "public"."release_figure_part"("release_id","id","figure_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_drawing" ADD CONSTRAINT "release_drawing_release_id_publication_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."publication_release"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_figure" ADD CONSTRAINT "release_figure_release_id_publication_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."publication_release"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_figure" ADD CONSTRAINT "release_figure_release_id_variant_id_release_variant_release_id_id_fk" FOREIGN KEY ("release_id","variant_id") REFERENCES "public"."release_variant"("release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_figure" ADD CONSTRAINT "release_figure_release_id_system_id_release_system_release_id_id_fk" FOREIGN KEY ("release_id","system_id") REFERENCES "public"."release_system"("release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_figure" ADD CONSTRAINT "release_figure_release_id_drawing_id_release_drawing_release_id_id_fk" FOREIGN KEY ("release_id","drawing_id") REFERENCES "public"."release_drawing"("release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_figure_part" ADD CONSTRAINT "release_figure_part_release_id_publication_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."publication_release"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_figure_part" ADD CONSTRAINT "release_figure_part_release_id_figure_id_release_figure_release_id_id_fk" FOREIGN KEY ("release_id","figure_id") REFERENCES "public"."release_figure"("release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_figure_part" ADD CONSTRAINT "release_figure_part_release_id_part_id_release_part_release_id_id_fk" FOREIGN KEY ("release_id","part_id") REFERENCES "public"."release_part"("release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_model" ADD CONSTRAINT "release_model_release_id_publication_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."publication_release"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_model" ADD CONSTRAINT "release_model_release_id_photo_drawing_id_release_drawing_release_id_id_fk" FOREIGN KEY ("release_id","photo_drawing_id") REFERENCES "public"."release_drawing"("release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_part" ADD CONSTRAINT "release_part_release_id_publication_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."publication_release"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_part" ADD CONSTRAINT "release_part_release_id_superseded_by_part_id_release_part_release_id_id_fk" FOREIGN KEY ("release_id","superseded_by_part_id") REFERENCES "public"."release_part"("release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_part_requires" ADD CONSTRAINT "release_part_requires_release_id_publication_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."publication_release"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_part_requires" ADD CONSTRAINT "release_part_requires_release_id_part_id_release_part_release_id_id_fk" FOREIGN KEY ("release_id","part_id") REFERENCES "public"."release_part"("release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_part_requires" ADD CONSTRAINT "release_part_requires_release_id_required_part_id_release_part_release_id_id_fk" FOREIGN KEY ("release_id","required_part_id") REFERENCES "public"."release_part"("release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_system" ADD CONSTRAINT "release_system_release_id_publication_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."publication_release"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_system" ADD CONSTRAINT "release_system_release_id_model_id_release_model_release_id_id_fk" FOREIGN KEY ("release_id","model_id") REFERENCES "public"."release_model"("release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_variant" ADD CONSTRAINT "release_variant_release_id_publication_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."publication_release"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_variant" ADD CONSTRAINT "release_variant_release_id_model_id_release_model_release_id_id_fk" FOREIGN KEY ("release_id","model_id") REFERENCES "public"."release_model"("release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_effective_company_id_company_id_fk" FOREIGN KEY ("effective_company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_record_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_issue" ADD CONSTRAINT "import_issue_job_id_import_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_job"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_issue" ADD CONSTRAINT "import_issue_resolved_by_user_id_app_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_issue" ADD CONSTRAINT "import_issue_staging_row_id_job_id_import_staging_row_id_job_id_fk" FOREIGN KEY ("staging_row_id","job_id") REFERENCES "public"."import_staging_row"("id","job_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_variant_id_model_id_variant_id_model_id_fk" FOREIGN KEY ("variant_id","model_id") REFERENCES "public"."variant"("id","model_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_staging_row" ADD CONSTRAINT "import_staging_row_job_id_import_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_job"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_submitted_by_user_id_app_user_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_dealer_company_id_company_id_fk" FOREIGN KEY ("dealer_company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_release_id_publication_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."publication_release"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_part_id_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_release_id_release_part_id_release_part_release_id_id_fk" FOREIGN KEY ("release_id","release_part_id") REFERENCES "public"."release_part"("release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "app_user_company" ON "app_user" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "company_machine_variant" ON "company_machine" USING btree ("company_id","variant_id");
--> statement-breakpoint
CREATE INDEX "reset_user" ON "password_reset_token" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "session_user" ON "session" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "audit_object_time" ON "audit_log" USING btree ("object_type","object_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "audit_company_time" ON "audit_log" USING btree ("effective_company_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "import_issue_job" ON "import_issue" USING btree ("job_id");
--> statement-breakpoint
CREATE INDEX "order_company_submitted" ON "order" USING btree ("company_id","submitted_at","id");
--> statement-breakpoint
CREATE INDEX "order_line_order" ON "order_line" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX "outbox_pending" ON "outbox_event" USING btree ("available_at","id") WHERE "outbox_event"."completed_at" IS NULL;

--> statement-breakpoint
INSERT INTO capability(key, description) VALUES
('catalog.model.view', 'See a model and its variants in the admin console'),
('catalog.model.create', 'Add a new model'),
('catalog.model.edit', 'Rename, change brand, edit systems and serial variants'),
('catalog.model.delete', 'Remove a model and its dependents'),
('catalog.variant.manage', 'Create, edit, and remove serial-range variants'),
('catalog.system.manage', 'Enable or disable systems on a model'),
('catalog.figure.view', 'Open a figure in the admin console'),
('catalog.figure.create', 'Add a figure to a system'),
('catalog.figure.edit', 'Rename, reorder, change system assignment'),
('catalog.figure.delete', 'Remove a figure'),
('catalog.drawing.upload', 'Upload or replace the drawing file'),
('catalog.callout.map', 'Attach a part record to a callout number'),
('catalog.callout.manage', 'Add, move, or remove callout markers'),
('parts.record.view', 'See part records in the admin console'),
('parts.record.create', 'Create a part'),
('parts.record.edit', 'Edit identifiers, description, brand, relationships'),
('parts.record.delete', 'Remove a part not referenced by any figure'),
('parts.record.supersede', 'Mark a part superseded and link its replacement'),
('parts.relationship.edit', 'Edit "also requires" links'),
('parts.import', 'Run a CSV or spreadsheet import'),
('parts.export', 'Download the parts data'),
('pricing.cost.view', 'See cost or price fields anywhere'),
('pricing.cost.edit', 'Edit prices'),
('pricing.tier.manage', 'Create and assign price tiers (list, dealer net, contract)'),
('pricing.tier.assign', 'Assign a tier to a customer account'),
('publish.draft.view', 'See unpublished changes and preview as a customer'),
('publish.execute', 'Push draft changes to the live catalog'),
('publish.rollback', 'Revert to an earlier published version'),
('publish.block.override', 'Publish despite validation failures'),
('orders.list.build', 'Add parts to a request list'),
('orders.submit', 'Submit an order to RUFDiamond'),
('orders.own.view', 'See orders raised by own company'),
('orders.all.view', 'See orders across all customers'),
('orders.quote', 'Enter pricing and lead times on an order'),
('orders.status.edit', 'Change order status'),
('orders.export', 'Export orders to accounting'),
('orders.behalf', 'Raise an order on behalf of a named end customer'),
('accounts.company.view', 'See customer company records'),
('accounts.company.manage', 'Create and edit customer companies'),
('accounts.fleet.manage', 'Set which machines a company owns'),
('users.own.manage', 'Add, remove, and set roles for users in own company'),
('users.all.manage', 'Manage users across all companies'),
('roles.manage', 'Create roles and change capability bundles'),
('audit.log.view', 'Read the change log'),
('audit.log.export', 'Export the change log');
--> statement-breakpoint
INSERT INTO role(key,name) VALUES ('catalog_admin','Catalog Admin'),('purchaser','Purchaser'),('technician','Technician');
--> statement-breakpoint
INSERT INTO price_tier(key,name,discount_rate) VALUES ('list','List',0),('dealer_net','Dealer net',0.10),('contract','Contract',0);
--> statement-breakpoint
-- Publishing is assigned to named staff through user_capability.
-- No pilot role gets publication overrides.
INSERT INTO role_capability(role_id,capability_key)
SELECT r.id,c.key FROM role r CROSS JOIN capability c
WHERE (r.key='catalog_admin' AND c.key NOT IN ('publish.execute','publish.rollback','publish.block.override'))
OR (r.key='purchaser' AND c.key IN ('orders.list.build','orders.submit','orders.own.view','pricing.cost.view'))
OR (r.key='technician' AND c.key IN ('orders.list.build','orders.own.view','pricing.cost.view'));
--> statement-breakpoint
CREATE FUNCTION reject_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
--> statement-breakpoint
-- Finalize validation before inserting canonical drawing metadata. Replacement
-- files have new IDs and keys; upload intents are a separate application concern.
CREATE TRIGGER drawing_immutable BEFORE UPDATE OR DELETE ON drawing_file
FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
--> statement-breakpoint
CREATE FUNCTION protect_release_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid; sealed_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.release_id IS DISTINCT FROM OLD.release_id THEN
    RAISE EXCEPTION 'Snapshot rows cannot move between releases' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN parent_id := OLD.release_id; ELSE parent_id := NEW.release_id; END IF;
  -- Serialize child edits with activation, including concurrent transactions.
  SELECT published_at INTO sealed_at FROM publication_release WHERE id = parent_id FOR UPDATE;
  IF sealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Published release snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['release_model','release_variant','release_system','release_drawing','release_figure','release_part','release_part_requires','release_figure_part','release_callout']
  LOOP
    EXECUTE format('CREATE TRIGGER snapshot_immutable BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_release_snapshot()', table_name);
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION protect_publication_release() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Published releases cannot be deleted' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','activated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','activated_at'])
       OR NEW.status NOT IN ('active','inactive') THEN
      RAISE EXCEPTION 'Only release activation state may change after publication' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER release_immutable BEFORE UPDATE OR DELETE ON publication_release
FOR EACH ROW EXECUTE FUNCTION protect_publication_release();
--> statement-breakpoint
CREATE FUNCTION protect_order_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid; submitted timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
    RAISE EXCEPTION 'Order lines cannot move between orders' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN parent_id := OLD.order_id; ELSE parent_id := NEW.order_id; END IF;
  SELECT submitted_at INTO submitted FROM "order" WHERE id = parent_id FOR UPDATE;
  IF submitted IS NOT NULL THEN
    RAISE EXCEPTION 'Submitted order lines are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER order_line_snapshot BEFORE INSERT OR UPDATE OR DELETE ON order_line
FOR EACH ROW EXECUTE FUNCTION protect_order_line();
--> statement-breakpoint
CREATE FUNCTION protect_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.submitted_at IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Submitted orders cannot be deleted' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','version','updated_at']) THEN
      RAISE EXCEPTION 'Submitted order financial snapshots are immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER order_snapshot BEFORE UPDATE OR DELETE ON "order"
FOR EACH ROW EXECUTE FUNCTION protect_order_snapshot();
--> statement-breakpoint
CREATE FUNCTION protect_import_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.model_id,NEW.variant_id,NEW.source_checksum,NEW.object_key,NEW.actor_id,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.model_id,OLD.variant_id,OLD.source_checksum,OLD.object_key,OLD.actor_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Import source and target identities are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER import_source_immutable BEFORE UPDATE ON import_job
FOR EACH ROW EXECUTE FUNCTION protect_import_source();
--> statement-breakpoint
CREATE FUNCTION protect_idempotency_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.actor_id,NEW.operation,NEW.key,NEW.request_hash,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.actor_id,OLD.operation,OLD.key,OLD.request_hash,OLD.created_at) THEN
    RAISE EXCEPTION 'Idempotency request identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'completed' AND ROW(NEW.status,NEW.response,NEW.response_status)
     IS DISTINCT FROM ROW(OLD.status,OLD.response,OLD.response_status) THEN
    RAISE EXCEPTION 'Completed idempotency responses are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER idempotency_identity_immutable BEFORE UPDATE ON idempotency_record
FOR EACH ROW EXECUTE FUNCTION protect_idempotency_record();
