import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { hit } from "@/server/rate-limit";
import { env, isAllowedEmail } from "./env";
import { sendSignInCode } from "./mail";

const FORBIDDEN = "Only Plaksha accounts can sign in.";

/** A batch tag in an address: ug25, pg24, phd23, tlp24, and the like. */
const BATCH = /^(ug|pg|phd|tlp|ms|mba|mtech|btech|yif)\d{2,4}$/i;

function nameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  return (
    local
      .split(/[._-]+/)
      // Plaksha addresses carry the batch ("swapneel.p.ug25"): drop it, and any bare numbers.
      .filter((p) => p && !/^\d+$/.test(p) && !BATCH.test(p))
      .map((p) => p[0]!.toUpperCase() + p.slice(1))
      .join(" ") || "Plaksha member"
  );
}

export const auth = betterAuth({
  appName: "Plaksha Pulse",
  baseURL: env.baseUrl,
  trustedOrigins: [env.baseUrl],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  // No passwords. Identity comes from Plaksha's Microsoft 365 tenant or a code sent to the Plaksha inbox.
  emailAndPassword: { enabled: false },
  socialProviders: env.microsoft
    ? {
        microsoft: {
          clientId: env.microsoft.clientId,
          clientSecret: env.microsoft.clientSecret,
          // A tenant GUID makes Better Auth pin the id-token issuer to Plaksha's tenant,
          // so tokens from any other organisation or personal Microsoft account are rejected.
          tenantId: env.microsoft.tenantId,
          prompt: "select_account",
          disableProfilePhoto: true,
          mapProfileToUser: (p: Record<string, unknown>) => {
            const email = String(p.email || p.preferred_username || "").toLowerCase();
            // Entra rarely sends email_verified. Inside our own tenant, an address on our own verified
            // domain is authoritative; B2B guests carry our tid but an outside domain, so they fail here.
            const verified = p.tid === env.microsoft!.tenantId && isAllowedEmail(email);
            return { email, emailVerified: verified, name: String(p.name || "") || nameFromEmail(email) };
          },
        },
      }
    : {},
  account: {
    accountLinking: { enabled: true, trustedProviders: ["microsoft"] },
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "member" },
      banned: { type: "boolean", input: false, defaultValue: false },
      departmentId: { type: "string", input: false, required: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  // These are keyed by IP, and the whole campus shares a handful of addresses on Wi-Fi, so they
  // are set high enough for a batch signing in at once. The limits that actually protect an inbox
  // are per email address and live in sendVerificationOTP below.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 600,
    customRules: {
      "/email-otp/send-verification-otp": { window: 60, max: 120 },
      "/sign-in/email-otp": { window: 60, max: 240 },
      "/sign-in/social": { window: 60, max: 120 },
      "/callback/*": { window: 60, max: 240 },
    },
  },
  advanced: {
    useSecureCookies: env.isProd,
    database: { generateId: () => crypto.randomUUID() },
  },
  hooks: {
    // Better Auth swallows errors thrown while sending the code, so anything the person needs to
    // hear about (wrong domain, too many codes) has to be decided here, before the endpoint runs.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/email-otp/send-verification-otp") return;
      const to = String((ctx.body as { email?: unknown } | undefined)?.email ?? "").trim().toLowerCase();
      if (!isAllowedEmail(to)) throw new APIError("FORBIDDEN", { message: FORBIDDEN });
      // Per browser: every code costs one of the day's emails, even for an address that doesn't
      // exist, so one browser can't spend them typing junk. The id is set by the sign-in page.
      const device = /(?:^|;\s*)pulse_device=([0-9a-f-]{36})/.exec(ctx.headers?.get("cookie") ?? "")?.[1];
      if (!device) throw new APIError("BAD_REQUEST", { message: "Reload the page and try again." });
      if (!(await hit(`otp-device:${device}`, 5, 900))) {
        throw new APIError("TOO_MANY_REQUESTS", { message: "Too many codes from this browser. Wait 15 minutes, and check the address is right — it includes your batch, like .ug25." });
      }
      // 3 codes per inbox per 10 minutes. With 5 guesses per code that is 15 guesses in a million.
      if (!(await hit(`otp:${to}`, 3, 600))) {
        throw new APIError("TOO_MANY_REQUESTS", { message: "Too many codes requested for this address. Use the latest one, or wait 10 minutes." });
      }
      if (env.smtpUrl && !(await hit("mail:day", env.mailDailyCap, 86_400))) {
        throw new APIError("TOO_MANY_REQUESTS", { message: "Pulse has sent all the sign-in emails it can today. Please try again tomorrow." });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (u) => {
          if (!isAllowedEmail(u.email)) throw new APIError("FORBIDDEN", { message: FORBIDDEN });
          const email = u.email.toLowerCase();
          return {
            data: {
              ...u,
              email,
              name: u.name?.trim() || nameFromEmail(email),
              // Roles are only ever assigned server-side.
              role: env.adminEmails.includes(email) ? "admin" : "member",
              banned: false,
            },
          };
        },
      },
      update: {
        before: async (u) => {
          // Defence in depth: nothing that flows through auth may change privileged fields.
          const { role: _r, banned: _b, departmentId: _d, email: _e, ...rest } = u as Record<string, unknown>;
          return { data: rest };
        },
      },
    },
    session: {
      create: {
        // Runs on every sign-in, so a ban or a domain change takes effect immediately.
        before: async (s) => {
          const [u] = await db.select().from(user).where(eq(user.id, s.userId)).limit(1);
          if (!u || !isAllowedEmail(u.email) || !u.emailVerified) {
            throw new APIError("FORBIDDEN", { message: FORBIDDEN });
          }
          if (u.banned) throw new APIError("FORBIDDEN", { message: "This account is suspended." });
          return { data: s };
        },
      },
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") throw new APIError("BAD_REQUEST", { message: "Unsupported." });
        if (!isAllowedEmail(email)) throw new APIError("FORBIDDEN", { message: FORBIDDEN });
        // Per-inbox and daily limits run in hooks.before, where a refusal reaches the person asking.
        await sendSignInCode(email.toLowerCase(), otp);
      },
    }),
    nextCookies(), // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;
