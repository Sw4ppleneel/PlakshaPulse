ALTER TABLE "comments" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "proposal_posts" ADD COLUMN "department_id" text;--> statement-breakpoint
-- Backfill: official posts made before this were labelled with the author's department at read time.
UPDATE "comments" c SET "department_id" = u."department_id" FROM "user" u WHERE c."official" AND c."author_id" = u."id" AND u."role" = 'staff';--> statement-breakpoint
UPDATE "proposal_posts" x SET "department_id" = p."department_id" FROM "proposals" p, "user" u WHERE x."official" AND x."proposal_id" = p."id" AND x."author_id" = u."id" AND u."role" = 'staff';
