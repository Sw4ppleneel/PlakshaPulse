import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const ts = (name: string) => timestamp(name, { withTimezone: true });

/* ───────────────────────── Auth (Better Auth core tables) ───────────────────────── */

export const roleEnum = pgEnum("role", ["member", "staff", "admin"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  // app fields — never writable from client input (input: false in auth config)
  role: roleEnum("role").notNull().default("member"),
  banned: boolean("banned").notNull().default(false),
  bannedReason: text("banned_reason"),
  departmentId: text("department_id"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ───────────────────────── Campus taxonomy ───────────────────────── */

export const departments = pgTable("departments", {
  id: text("id").primaryKey(), // slug, e.g. "it"
  name: text("name").notNull(),
  description: text("description"),
  email: text("email"),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(), // slug, e.g. "wifi"
  name: text("name").notNull(),
  icon: text("icon").notNull(), // lucide icon name
  color: text("color").notNull(), // hex, used for bubbles
  departmentId: text("department_id")
    .notNull()
    .references(() => departments.id),
  slaHours: integer("sla_hours").notNull().default(72),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const locations = pgTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  zone: text("zone").notNull(), // Residential, Academic, Dining, Sports, Common
  sortOrder: integer("sort_order").notNull().default(0),
});

/* ───────────────────────── Issues ───────────────────────── */

export const issueStatusEnum = pgEnum("issue_status", [
  "open", // reported, awaiting triage
  "acknowledged", // a department has seen it
  "in_progress",
  "resolved", // marked fixed, awaiting reporters' verification
  "closed", // verified fixed (or auto-closed after the verification window)
  "wont_fix",
  "duplicate", // merged into another issue
]);

export const severityEnum = pgEnum("severity", ["low", "medium", "high"]);

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull().unique(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    locationId: text("location_id").references(() => locations.id),
    locationDetail: text("location_detail"),
    severity: severityEnum("severity").notNull().default("medium"),
    status: issueStatusEnum("status").notNull().default("open"),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id),
    anonymous: boolean("anonymous").notNull().default(false),
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id),
    duplicateOfId: uuid("duplicate_of_id"),
    metooCount: integer("metoo_count").notNull().default(1),
    commentCount: integer("comment_count").notNull().default(0),
    reopenCount: integer("reopen_count").notNull().default(0),
    resolutionNote: text("resolution_note"),
    wontFixReason: text("wont_fix_reason"),
    hidden: boolean("hidden").notNull().default(false),
    hiddenReason: text("hidden_reason"),
    dueAt: ts("due_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    acknowledgedAt: ts("acknowledged_at"),
    resolvedAt: ts("resolved_at"),
    closedAt: ts("closed_at"),
  },
  (t) => [
    index("issues_status_idx").on(t.status),
    index("issues_category_idx").on(t.categoryId),
    index("issues_department_idx").on(t.departmentId),
    index("issues_reporter_idx").on(t.reporterId),
    index("issues_created_idx").on(t.createdAt),
    index("issues_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
  ],
);

/** "Me too" — one per user per issue. The reporter holds the first one. */
export const issueVotes = pgTable(
  "issue_votes",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.userId] }), index("votes_user_idx").on(t.userId)],
);

export const issueWatchers = pgTable(
  "issue_watchers",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.userId] })],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    anonymous: boolean("anonymous").notNull().default(false),
    official: boolean("official").notNull().default(false), // posted on behalf of a department
    hidden: boolean("hidden").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("comments_issue_idx").on(t.issueId, t.createdAt)],
);

export const eventTypeEnum = pgEnum("event_type", [
  "created",
  "status_changed",
  "reassigned",
  "merged_in", // another issue was merged into this one
  "merged_away", // this issue was merged into another
  "reopened",
  "verified",
  "hidden",
  "restored",
  "edited",
]);

/** Public, append-only timeline. Actor is shown as a department for staff actions. */
export const issueEvents = pgTable(
  "issue_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id),
    actorRole: roleEnum("actor_role"),
    type: eventTypeEnum("type").notNull(),
    fromStatus: issueStatusEnum("from_status"),
    toStatus: issueStatusEnum("to_status"),
    departmentId: text("department_id"),
    relatedIssueId: uuid("related_issue_id"),
    note: text("note"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("events_issue_idx").on(t.issueId, t.createdAt)],
);

/** "Is it fixed?" responses while an issue is in `resolved`. */
export const verifications = pgTable(
  "verifications",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    round: integer("round").notNull().default(0), // matches issues.reopen_count at the time
    fixed: boolean("fixed").notNull(),
    note: text("note"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.userId, t.round] })],
);

export const attachmentKindEnum = pgEnum("attachment_kind", ["report", "resolution"]);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    uploaderId: text("uploader_id")
      .notNull()
      .references(() => user.id),
    kind: attachmentKindEnum("kind").notNull().default("report"),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    data: bytea("data").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("attachments_issue_idx").on(t.issueId)],
);

/* ───────────────────────── Moderation ───────────────────────── */

export const flagTargetEnum = pgEnum("flag_target", ["issue", "comment"]);

export const flags = pgTable(
  "flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: flagTargetEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("flags_unique_idx").on(t.targetType, t.targetId, t.userId),
    index("flags_open_idx").on(t.resolved),
  ],
);

/* ───────────────────────── Notifications & audit ───────────────────────── */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // status, comment, merged, verify, mention
    message: text("message").notNull(),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

/** Private admin audit log (role changes, bans, moderation). Never shown publicly. */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id").references(() => user.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  detail: text("detail"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type IssueStatus = (typeof issueStatusEnum.enumValues)[number];
export type Role = (typeof roleEnum.enumValues)[number];
export type Severity = (typeof severityEnum.enumValues)[number];
