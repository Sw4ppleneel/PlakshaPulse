/** Shared between server and client. No secrets here. */

export const STATUSES = [
  "open",
  "acknowledged",
  "in_progress",
  "resolved",
  "closed",
  "wont_fix",
  "duplicate",
] as const;
export type Status = (typeof STATUSES)[number];

export const ACTIVE_STATUSES: Status[] = ["open", "acknowledged", "in_progress", "resolved"];
export const DONE_STATUSES: Status[] = ["closed", "wont_fix", "duplicate"];

export const STATUS_META: Record<Status, { label: string; short: string; tone: string; hint: string }> = {
  open: { label: "Reported", short: "Reported", tone: "open", hint: "Waiting for a department to pick it up" },
  acknowledged: { label: "Acknowledged", short: "Seen", tone: "ack", hint: "A department has seen this" },
  in_progress: { label: "In progress", short: "Working", tone: "progress", hint: "Someone is working on it" },
  resolved: {
    label: "Fixed · awaiting confirmation",
    short: "Fixed?",
    tone: "resolved",
    hint: "Marked fixed — reporters confirm or reopen",
  },
  closed: { label: "Verified fixed", short: "Fixed", tone: "closed", hint: "Confirmed fixed" },
  wont_fix: { label: "Won't fix", short: "Won't fix", tone: "wontfix", hint: "Closed with a public reason" },
  duplicate: { label: "Merged", short: "Merged", tone: "dup", hint: "Merged into another issue" },
};

/** Which manual transitions staff/admins may make. Resolution/merge have dedicated flows. */
export const TRANSITIONS: Record<Status, Status[]> = {
  open: ["acknowledged", "in_progress", "resolved", "wont_fix"],
  acknowledged: ["in_progress", "resolved", "wont_fix"],
  in_progress: ["acknowledged", "resolved", "wont_fix"],
  resolved: ["in_progress", "closed"],
  closed: ["in_progress"],
  wont_fix: ["open"],
  duplicate: ["open"],
};

export const SEVERITY_META = {
  low: { label: "Minor", weight: 1 },
  medium: { label: "Disruptive", weight: 1.25 },
  high: { label: "Urgent / safety", weight: 1.6 },
} as const;
export type SeverityKey = keyof typeof SEVERITY_META;

/** Heat half-life: a "me too" counts half as much after this many hours. */
export const HEAT_HALF_LIFE_HOURS = 72;
/** Days an issue stays in "resolved" before it auto-closes if nobody disputes it. */
export const VERIFY_WINDOW_DAYS = 7;
/** "Still broken" responses needed to reopen (reporter alone always suffices). */
export const REOPEN_QUORUM = 2;
/** "Fixed" confirmations that close early (reporter alone always suffices). */
export const CLOSE_QUORUM = 3;
/** Distinct flags that auto-hide content pending admin review. */
export const AUTO_HIDE_FLAGS = 5;
export const MAX_ISSUES_PER_DAY = 5;
/** How many of one person's posts may sit in the approval queue at once. Keeps one account from flooding moderators. */
export const MAX_PENDING_POSTS = 3;
export const MAX_PENDING_COMMENTS = 8;
export const PENDING_NOTE = "Waiting for a moderator to approve it";
export const MAX_PHOTOS = 3;

export const FLAG_REASONS = [
  "Spam or joke post",
  "Harassment or names a person",
  "Personal information",
  "Not a campus issue",
  "Other",
] as const;

/* ───────────────────────── Proposals ───────────────────────── */

export const STAGES = ["gathering", "in_review", "trial", "adopted", "declined", "withdrawn"] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES: Stage[] = ["gathering", "in_review", "trial"];

export const STAGE_META: Record<Stage, { label: string; step: number; hint: string }> = {
  gathering: { label: "Gathering interest", step: 1, hint: "Collecting verified support from the community" },
  in_review: { label: "With the office", step: 2, hint: "Taken to the office that can say yes, with the evidence attached" },
  trial: { label: "Trial run", step: 3, hint: "Running for a fixed period — people who use it check in" },
  adopted: { label: "Adopted", step: 4, hint: "Made permanent" },
  declined: { label: "Not approved", step: 4, hint: "Declined, with a public reason" },
  withdrawn: { label: "Withdrawn", step: 0, hint: "Closed by the proposer or an admin" },
};

/** The pipeline shown on every proposal. Mirrors how campus changes actually get approved. */
export const PIPELINE: { stage: Stage; label: string; detail: string }[] = [
  { stage: "gathering", label: "Show interest", detail: "Verified supporters, intended use, volunteers" },
  { stage: "in_review", label: "Take it to the office", detail: "Evidence pack goes with it" },
  { stage: "trial", label: "Trial run", detail: "Daily check-ins from people using it" },
  { stage: "adopted", label: "Decision", detail: "Adopted or declined, in public" },
];

/** Who may move a proposal where. Author moves are a subset; offices/admins can do the rest. */
export const STAGE_MOVES: Record<Stage, Stage[]> = {
  gathering: ["in_review", "trial", "adopted", "declined", "withdrawn"],
  in_review: ["gathering", "trial", "adopted", "declined", "withdrawn"],
  trial: ["in_review", "adopted", "declined"],
  adopted: ["trial"],
  declined: ["gathering", "in_review"],
  withdrawn: ["gathering"],
};
export const AUTHOR_MOVES: Partial<Record<Stage, Stage[]>> = {
  gathering: ["in_review", "withdrawn"],
  in_review: ["gathering", "withdrawn"],
};

export const AREAS = [
  { id: "spaces", label: "Spaces & access", hint: "Opening a room, longer hours, new uses for a space" },
  { id: "food", label: "Food & cafés", hint: "Menus, timings, a new counter or vendor" },
  { id: "events", label: "Events & culture", hint: "Recurring events, fests, traditions" },
  { id: "clubs", label: "Clubs & funding", hint: "Budgets, sponsorships, approvals for student bodies" },
  { id: "academics", label: "Academics", hint: "Courses, labs, makerspace, library" },
  { id: "wellbeing", label: "Health & wellbeing", hint: "Sports, fitness, counselling, rest" },
  { id: "mobility", label: "Transport & mobility", hint: "Buses, cycles, trips off campus" },
  { id: "policy", label: "Rules & policy", hint: "Curfews, guest policy, processes" },
  { id: "other", label: "Something else", hint: "" },
] as const;
export type AreaId = (typeof AREAS)[number]["id"];
export const AREA_LABEL = Object.fromEntries(AREAS.map((a) => [a.id, a.label])) as Record<string, string>;

export const USAGE_META = {
  often: { label: "I'd use it every week", short: "Weekly use" },
  sometimes: { label: "I'd use it now and then", short: "Occasional use" },
  backing: { label: "I won't use it much, but I back it", short: "Backing only" },
} as const;

/** Offered on first support. Free text is allowed too, but these keep the breakdown clean. */
export const COHORTS = ["Class of 2027", "Class of 2028", "Class of 2029", "Class of 2030", "Postgrad / PhD", "Faculty", "Staff"] as const;

export const TRIAL_RATINGS = {
  3: { label: "Worked well", tone: "ok" },
  2: { label: "It was okay", tone: "warn" },
  1: { label: "Didn't work", tone: "danger" },
} as const;

export const MAX_PROPOSALS_PER_DAY = 3;
export const DEFAULT_GOAL = 100;
