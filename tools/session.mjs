// Shared helpers for QA screenshots and the demo video: sign in through the real email-code flow
// (the dev server prints codes to .logs/dev.log), in a throwaway headless Chrome profile.
import { chromium } from "playwright-core";
import { existsSync, readFileSync } from "node:fs";

export const BASE = process.env.BASE ?? "http://localhost:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch(opts = {}) {
  return chromium.launch({ channel: "chrome", headless: true, ...opts });
}

export async function signIn(context, email) {
  // The sign-in page sets the per-browser id that code requests are limited by.
  await context.request.get(`${BASE}/signin`);
  const before = readFileSync(".logs/dev.log", "utf8").length;
  const res = await context.request.post(`${BASE}/api/auth/email-otp/send-verification-otp`, {
    data: { email, type: "sign-in" },
    headers: { Origin: BASE },
  });
  if (!res.ok()) throw new Error(`send otp ${res.status()}`);
  let code;
  for (let i = 0; i < 40 && !code; i++) {
    await sleep(150);
    const log = readFileSync(".logs/dev.log", "utf8").slice(before);
    const m = log.match(new RegExp(`${email.replace(/[.@]/g, "\\$&")}\\s*\\n│ (\\d{6})`));
    code = m?.[1];
  }
  if (!code) throw new Error("no code in dev log");
  const r2 = await context.request.post(`${BASE}/api/auth/sign-in/email-otp`, { data: { email, otp: code }, headers: { Origin: BASE } });
  if (!r2.ok()) throw new Error(`sign in ${r2.status()} ${await r2.text()}`);
}

/** Signs in once per email and caches the session cookies for reuse across contexts. */
export async function contextFor(browser, email, options = {}) {
  const file = `.logs/state-${email}.json`;
  if (existsSync(file)) {
    const ctx = await browser.newContext({ ...options, storageState: file });
    const r = await ctx.request.get(`${BASE}/api/auth/get-session`);
    if (r.ok() && (await r.text()) !== "null") return ctx;
    await ctx.close();
  }
  const ctx = await browser.newContext(options);
  await signIn(ctx, email);
  await ctx.storageState({ path: file });
  return ctx;
}
