CREATE TABLE "drawing_upload_intent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"figure_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"expected_sha256" text NOT NULL,
	"expected_bytes" integer NOT NULL,
	"expected_figure_version" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"finalized_drawing_id" uuid,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "drawing_upload_intent_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "drawing_upload_limits" CHECK ("drawing_upload_intent"."expected_bytes" BETWEEN 1 AND 20971520 AND "drawing_upload_intent"."expected_figure_version" BETWEEN 1 AND 2147483646),
	CONSTRAINT "drawing_upload_hash" CHECK ("drawing_upload_intent"."expected_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "drawing_upload_key" CHECK ("drawing_upload_intent"."object_key" ~ '^quarantine/[0-9a-f-]{36}/[0-9a-f-]{36}[.]png$'),
	CONSTRAINT "drawing_upload_expiry" CHECK ("drawing_upload_intent"."expires_at" > "drawing_upload_intent"."created_at"),
	CONSTRAINT "drawing_upload_state" CHECK (("drawing_upload_intent"."state" = 'finalized' AND "drawing_upload_intent"."finalized_drawing_id" IS NOT NULL AND "drawing_upload_intent"."finalized_at" IS NOT NULL) OR ("drawing_upload_intent"."state" IN ('pending','cleanup','cleaned') AND "drawing_upload_intent"."finalized_drawing_id" IS NULL AND "drawing_upload_intent"."finalized_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "drawing_upload_intent" ADD CONSTRAINT "drawing_upload_intent_actor_user_id_app_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_upload_intent" ADD CONSTRAINT "drawing_upload_intent_figure_id_figure_id_fk" FOREIGN KEY ("figure_id") REFERENCES "public"."figure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_upload_intent" ADD CONSTRAINT "drawing_upload_intent_finalized_drawing_id_drawing_file_id_fk" FOREIGN KEY ("finalized_drawing_id") REFERENCES "public"."drawing_file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drawing_upload_cleanup" ON "drawing_upload_intent" USING btree ("state","created_at");
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE public.drawing_upload_intent FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.drawing_upload_intent FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.drawing_upload_intent FROM authenticated';
  END IF;
END $$;
