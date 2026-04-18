ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "language_locale" text DEFAULT 'en' NOT NULL;
