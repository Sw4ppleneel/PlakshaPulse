CREATE TYPE "public"."proposal_post_kind" AS ENUM('created', 'stage', 'update', 'comment');--> statement-breakpoint
CREATE TYPE "public"."proposal_stage" AS ENUM('gathering', 'in_review', 'trial', 'adopted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."proposal_usage" AS ENUM('often', 'sometimes', 'backing');--> statement-breakpoint
CREATE TABLE "proposal_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"author_id" text,
	"kind" "proposal_post_kind" NOT NULL,
	"from_stage" "proposal_stage",
	"to_stage" "proposal_stage",
	"official" boolean DEFAULT false NOT NULL,
	"body" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_supports" (
	"proposal_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"usage" "proposal_usage" DEFAULT 'sometimes' NOT NULL,
	"volunteer" boolean DEFAULT false NOT NULL,
	"show_name" boolean DEFAULT true NOT NULL,
	"cohort" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_supports_proposal_id_user_id_pk" PRIMARY KEY("proposal_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"title" text NOT NULL,
	"ask" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"area" text NOT NULL,
	"department_id" text,
	"goal" integer DEFAULT 100 NOT NULL,
	"stage" "proposal_stage" DEFAULT 'gathering' NOT NULL,
	"author_id" text NOT NULL,
	"support_count" integer DEFAULT 1 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"trial_plan" text,
	"trial_starts_on" text,
	"trial_ends_on" text,
	"decision_note" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "trial_checkins" (
	"proposal_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"rating" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_checkins_proposal_id_user_id_day_pk" PRIMARY KEY("proposal_id","user_id","day")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "cohort" text;--> statement-breakpoint
ALTER TABLE "proposal_posts" ADD CONSTRAINT "proposal_posts_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_posts" ADD CONSTRAINT "proposal_posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_supports" ADD CONSTRAINT "proposal_supports_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_supports" ADD CONSTRAINT "proposal_supports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_checkins" ADD CONSTRAINT "trial_checkins_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_checkins" ADD CONSTRAINT "trial_checkins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proposal_posts_idx" ON "proposal_posts" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE INDEX "supports_user_idx" ON "proposal_supports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "supports_time_idx" ON "proposal_supports" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE INDEX "proposals_stage_idx" ON "proposals" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "proposals_author_idx" ON "proposals" USING btree ("author_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;