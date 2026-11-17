import "server-only";

function list(v: string | undefined) {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const isProd = process.env.NODE_ENV === "production";

if (isProd) {
  for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "ALLOWED_EMAIL_DOMAIN"]) {
    if (!process.env[key]) throw new Error(`Missing required env var ${key}`);
  }
  const t = process.env.MICROSOFT_TENANT_ID;
  if (t && ["common", "organizations", "consumers"].includes(t)) {
    throw new Error("MICROSOFT_TENANT_ID must be the Plaksha tenant GUID, not a multi-tenant alias");
  }
  if ((process.env.BETTER_AUTH_SECRET ?? "").length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
  }
}

export const env = {
  isProd,
  baseUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:3100",
  allowedDomains: list(process.env.ALLOWED_EMAIL_DOMAIN || "plaksha.edu.in"),
  adminEmails: list(process.env.ADMIN_EMAILS),
  /** Plaksha runs on Microsoft 365, so sign-in is single-tenant Entra ID, never "common". */
  microsoft:
    process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_TENANT_ID
      ? {
          clientId: process.env.MICROSOFT_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
          tenantId: process.env.MICROSOFT_TENANT_ID,
        }
      : null,
  smtpUrl: process.env.SMTP_URL || null,
  /** Gmail allows about 500 recipients a day; stop a little short so the last people get a clear message. */
  mailDailyCap: Number(process.env.MAIL_DAILY_CAP) || 450,
  mailFrom: process.env.MAIL_FROM || "Plaksha Pulse <no-reply@plaksha.edu.in>",
};

/** Exact-domain match only: `a@plaksha.edu.in` passes, `a@evilplaksha.edu.in` and `a@plaksha.edu.in.evil.com` do not. */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at !== e.indexOf("@")) return false;
  return env.allowedDomains.includes(e.slice(at + 1));
}
