import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { env, isAllowedEmail } from "./env";
import { sendSignInCode } from "./mail";

const FORBIDDEN = "Only Plaksha accounts can sign in.";

function nameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  return (
    local
      .split(/[._-]+/)
      .filter((p) => p && !/^\d+$/.test(p))
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
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/sign-in/email-otp": { window: 300, max: 10 },
      "/sign-in/social": { window: 60, max: 10 },
      "/callback/*": { window: 60, max: 20 },
    },
  },
  advanced: {
    useSecureCookies: env.isProd,
    database: { generateId: () => crypto.randomUUID() },
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
        await sendSignInCode(email.toLowerCase(), otp);
      },
    }),
    nextCookies(), // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;
