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
export const MAX_ISSUES_PER_DAY = 10;
export const MAX_PHOTOS = 3;

export const FLAG_REASONS = [
  "Spam or joke post",
  "Harassment or names a person",
  "Personal information",
  "Not a campus issue",
  "Other",
] as const;
