CREATE TYPE "public"."approval" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'mod' BEFORE 'admin';--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "approval" "approval" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "approval" "approval" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal_posts" ADD COLUMN "approval" "approval" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal_supports" ADD COLUMN "reason_approval" "approval" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "approval" "approval" DEFAULT 'approved' NOT NULL;