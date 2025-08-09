CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"github_id" text,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"role" text DEFAULT 'user',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");