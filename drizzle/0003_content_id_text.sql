ALTER TABLE "upload_tasks" DROP CONSTRAINT IF EXISTS "upload_tasks_content_id_content_content_id_fk";--> statement-breakpoint
ALTER TABLE "content" ALTER COLUMN "content_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "content" ALTER COLUMN "content_id" SET DATA TYPE text USING "content_id"::text;--> statement-breakpoint
ALTER TABLE "upload_tasks" ALTER COLUMN "content_id" SET DATA TYPE text USING "content_id"::text;--> statement-breakpoint
ALTER TABLE "upload_tasks" ADD CONSTRAINT "upload_tasks_content_id_content_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "content"("content_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP SEQUENCE IF EXISTS "content_content_id_seq";