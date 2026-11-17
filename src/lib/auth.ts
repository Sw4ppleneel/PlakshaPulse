import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { hit, isLive } from "@/server/rate-limit";
import { DEVICE_COOKIE, readCookie, verifyDeviceToken } from "./device";
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
  // Endpoints Pulse doesn't use. /update-user would let anyone rename themselves (impersonating an
  // office, or posting unreviewed text as a name); the rest are password/email-change flows that
  // don't apply to code sign-in.
  disabledPaths: [
    "/update-user",
    "/change-email",
    "/change-password",
    "/set-password",
    "/delete-user",
    "/email-otp/change-email",
    "/email-otp/request-email-change",
    "/email-otp/request-password-reset",
    "/email-otp/reset-password",
    "/email-otp/check-verification-otp",
    "/email-otp/verify-email",
    "/forget-password/email-otp",
  ],
  hooks: {
    // Better Auth swallows errors thrown while sending the code, so anything the person needs to
    // hear about (wrong domain, too many codes) has to be decided here, before the endpoint runs.
    before: createAuthMiddleware(async (ctx) => {
      const sending = ctx.path === "/email-otp/send-verification-otp";
      const verifying = ctx.path === "/sign-in/email-otp";
      if (!sending && !verifying) return;
      const body = (ctx.body ?? {}) as { email?: unknown; type?: unknown };
      const to = String(body.email ?? "").trim().toLowerCase();
      if (!isAllowedEmail(to)) throw new APIError("FORBIDDEN", { message: FORBIDDEN });
      const device = await verifyDeviceToken(readCookie(ctx.headers?.get("cookie"), DEVICE_COOKIE));
      if (!device) throw new APIError("BAD_REQUEST", { message: "Reload the page and try again." });

      if (verifying) {
        // A code only works in the browser that asked for it. Without this, anyone could burn a
        // person's code with five wrong guesses and keep them locked out.
        if (!(await isLive(`otp-owner:${to}:${device}`))) {
          throw new APIError("BAD_REQUEST", { message: "Enter the code in the same browser you asked for it from, or request a new one." });
        }
        return;
      }

      if (body.type !== "sign-in") throw new APIError("BAD_REQUEST", { message: "Unsupported." });
      // Per browser: 5 codes per 15 minutes.
      if (!(await hit(`otp-device:${device}`, 5, 900))) {
        throw new APIError("TOO_MANY_REQUESTS", { message: "Too many codes from this browser. Wait 15 minutes, and check the address is right — it includes your batch, like .ug25." });
      }
      // Per inbox: 3 codes per 10 minutes. With 5 guesses per code that is 15 guesses in a million.
      if (!(await hit(`otp:${to}`, 3, 600))) {
        throw new APIError("TOO_MANY_REQUESTS", { message: "Too many codes requested for this address. Use the latest one, or wait 10 minutes." });
      }
      // Addresses that have never signed in: cap per network and per day, so typing junk (or a
      // script doing it) can't use up the day's emails for people who already have accounts.
      const [known] = await db.select({ id: user.id }).from(user).where(eq(user.email, to)).limit(1);
      if (!known) {
        const ip = (ctx.headers?.get("x-real-ip") ?? ctx.headers?.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
        if (!(await hit(`otp-new-ip:${ip}`, 60, 3600))) {
          throw new APIError("TOO_MANY_REQUESTS", { message: "Too many new sign-ups from this network right now. Try again in a little while." });
        }
        if (env.smtpUrl && !(await hit("mail:day:new", env.mailDailyCapNew, 86_400))) {
          throw new APIError("TOO_MANY_REQUESTS", { message: "Pulse has sent all the sign-up emails it can today. Please try again tomorrow." });
        }
      }
      await hit(`otp-owner:${to}:${device}`, 1_000_000, 600);
    }),
    // The send itself runs inside Better Auth, which reports success even when it fails. It leaves
    // a note on the request (see sendVerificationOTP); turn that into an honest error here.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/email-otp/send-verification-otp") return;
      const failed = (ctx.context as { pulseMail?: "cap" | "error" }).pulseMail;
      if (failed === "cap") throw new APIError("TOO_MANY_REQUESTS", { message: "Pulse has sent all the sign-in emails it can today. Please try again tomorrow." });
      if (failed === "error") throw new APIError("SERVICE_UNAVAILABLE", { message: "We couldn't send the email just now. Try again in a minute." });
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (u, ctx) => {
          if (!isAllowedEmail(u.email)) throw new APIError("FORBIDDEN", { message: FORBIDDEN });
          const email = u.email.toLowerCase();
          // Only Microsoft's directory name is trusted; a name sent with a code sign-in is ignored.
          const fromDirectory = ctx?.path?.startsWith("/callback") ? u.name?.trim().slice(0, 60) : "";
          return {
            data: {
              ...u,
              email,
              name: fromDirectory || nameFromEmail(email),
              image: null,
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
      async sendVerificationOTP({ email, otp, type }, ctx) {
        if (type !== "sign-in" || !isAllowedEmail(email)) return;
        const note = (v: "cap" | "error") => {
          if (ctx) (ctx.context as { pulseMail?: string }).pulseMail = v;
        };
        // Counted only when a mail is really about to go out.
        if (env.smtpUrl && !(await hit("mail:day", env.mailDailyCap, 86_400))) return note("cap");
        try {
          await sendSignInCode(email.toLowerCase(), otp);
        } catch (e) {
          console.error("[mail] sign-in code not sent:", (e as Error).message);
          note("error");
        }
      },
    }),
    nextCookies(), // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;
