CREATE TABLE IF NOT EXISTS "content" (
	"content_id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"content_title" text DEFAULT '' NOT NULL,
	"category_id" integer,
	"duration" double precision,
	"width" integer,
	"height" integer,
	"fps" integer,
	"file_size" bigint,
	"privacy" smallint DEFAULT 3 NOT NULL,
	"upload_state" text DEFAULT 'pending' NOT NULL,
	"video_key" text,
	"thumb_key" text,
	"has_custom_thumb" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_tasks" (
	"task_id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"content_id" integer,
	"kind" text NOT NULL,
	"object_key" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"user_id" serial PRIMARY KEY NOT NULL,
	"user_name" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"avatar_key" text,
	"password_hash" text NOT NULL,
	"auth_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content" ADD CONSTRAINT "content_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_tasks" ADD CONSTRAINT "upload_tasks_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_tasks" ADD CONSTRAINT "upload_tasks_content_id_content_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("content_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_user_created_idx" ON "content" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_title_idx" ON "content" USING btree ("content_title");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_user_name_unique" ON "users" USING btree ("user_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_auth_key_idx" ON "users" USING btree ("auth_key");