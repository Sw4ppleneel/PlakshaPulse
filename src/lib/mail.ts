import "server-only";
import nodemailer from "nodemailer";
import { env } from "./env";

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

export async function sendSignInCode(email: string, code: string) {
  if (!env.smtpUrl) {
    if (env.isProd) throw new Error("SMTP_URL is not configured");
    // Development only: there is no mail server, so print the code to the server console.
    console.log(`\n┌─ Pulse sign-in code ───────────────\n│ ${email}\n│ ${code}\n└────────────────────────────────────\n`);
    return;
  }
  transport ??= nodemailer.createTransport(env.smtpUrl);
  await transport.sendMail({
    from: env.mailFrom,
    to: email,
    subject: `${code} is your Pulse sign-in code`,
    text: `Your Plaksha Pulse sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px">
      <p style="font-size:14px;color:#555">Your Plaksha Pulse sign-in code</p>
      <p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:8px 0 16px">${code}</p>
      <p style="font-size:13px;color:#777">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>
    </div>`,
  });
}
