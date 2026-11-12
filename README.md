# Pulse · Plaksha

**Every campus issue, in the open.** Pulse is a shared board where anyone at Plaksha reports a campus
issue once, everyone affected adds a *me too*, and the owning office resolves it in public. Today it
goes through a QR ticket form: tickets vanish into an inbox, duplicates pile up unseen, and updates
get lost in WhatsApp groups.

- **The board.** Every open issue is a bubble. Size is the number of people affected; glow is recent
  activity (a 72-hour half-life per me-too). Students, faculty and admins all see the same board.
- **Reporting.** Pick a category and a place, then type. Duplicate detection (IDF keyword overlap,
  campus synonyms such as hostel→residence and internet→Wi-Fi, plus trigram fuzziness) suggests
  existing issues so a duplicate becomes a one-tap me-too.
- **Accountability.** Each category routes to an office and carries a target time. The public timeline
  is append-only, staff post official updates, and marking an issue fixed needs a public note
  (after photos are optional).
- **"Fixed" has to be confirmed.** Everyone affected is asked *is it actually fixed?* Two "still broken"
  replies, or one from the reporter, reopen the issue. If no one disputes it within 7 days, it closes.
- **Scoreboard and resolution log.** Each office's open count, overdue items, median fix time,
  median first response and on-time rate, computed live.
- **Admin.** Triage (untriaged, overdue, awaiting confirmation), a moderation queue (five flags
  hide content automatically), roles (member / department staff / admin), suspensions and a
  private audit log.
- **Anonymity with accountability.** Other users don't see an anonymous reporter's name. Admins do.

A narrated 2-minute walkthrough is at [`demo/Pulse-demo.mp4`](demo/Pulse-demo.mp4).

## Stack

| | |
|---|---|
| App | Next.js 16.4 (App Router, server actions), React 19.3, TypeScript 5.9 |
| UI | Tailwind 4, DM Sans + Fraunces, lucide icons, sonner toasts, a canvas + d3-force bubble field |
| Data | PostgreSQL (`pg_trgm`), Drizzle ORM 0.45 |
| Auth | Better Auth 1.7: Microsoft Entra ID (single-tenant) plus 6-digit email codes |
| Images | Re-encoded with sharp and stored in Postgres, served only to signed-in users |

Plaksha's mail runs on Microsoft 365 (MX `plaksha-edu-in.mail.protection.outlook.com`, Entra tenant
`45798c33-1b43-4c01-bf3e-d8d655d3389c`), so sign-in is Microsoft, not Google. The palette is
Plaksha teal `#007878` with FretBox navy `#102E4D` and Plaksha yellow `#FFC35A`.

## Security model ("no open endpoints")

- **Every server action, page and route handler authorizes in the data-access layer**
  (`src/server/dal.ts`). `src/proxy.ts` only redirects visitors and adds a CSP nonce; nothing
  relies on it for security.
- **Identity.** Only `@plaksha.edu.in`, exact match (`x@plaksha.edu.in.evil.com` fails). The check
  runs when a user is created and again on every sign-in.
  - Entra is pinned to Plaksha's tenant GUID, so Better Auth validates the token issuer.
  - B2B guests carry Plaksha's tenant ID but an outside email domain, so they are rejected.
  - Email codes are hashed, expire in 10 minutes, allow 5 attempts, and are rate-limited to 3 per
    minute.
- **Privilege.** Roles are never accepted from client input; Better Auth `input: false` plus an
  update hook strips them.
  - Staff can only act on issues routed to their department.
  - Closing without reporter confirmation, moderation and role changes are admin-only.
  - Bans revoke sessions immediately.
- **Abuse.** Per-user burst limits on every write, at most 10 reports per day, community flags with
  auto-hide, and an audit log.
- **Uploads.** Size and type are checked, then sharp sniffs the real format, re-encodes to WebP and
  strips EXIF/GPS. Images are served with `sandbox` CSP and `nosniff`.
- **Headers.** Nonce CSP, HSTS, `frame-ancestors 'none'`, a restrictive Permissions-Policy,
  `robots: noindex`.
- **Verified by scripts.** `npm run security:check` calls privileged server actions directly as a
  plain member and with no session. It also replays a real staff request with a member's cookie.
  Every call is rejected and the database is unchanged.

## Run it locally

```bash
createdb pulse_dev                 # Postgres 14+ with contrib (pg_trgm)
cp .env.example .env               # set DATABASE_URL and BETTER_AUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:migrate
npm run db:seed -- --demo          # taxonomy + a month of realistic demo activity
npm run dev                        # http://localhost:3100
```

Sign in with any demo account. With no SMTP configured, the **code prints in the dev server console**.

| Account | Role |
|---|---|
| `student.demo@plaksha.edu.in` | member |
| `faculty.demo@plaksha.edu.in` | member (faculty) |
| `facilities.demo@plaksha.edu.in` (also `it.`, `dining.`, `security.` …) | department staff |
| `admin.demo@plaksha.edu.in` | admin |

Other scripts: `npm run e2e` (full loop across four accounts), `npm run security:check`,
`npm run shots -- <email> <outdir> /board /issues/1`, and `npm run demo:video` (re-records
`demo/Pulse-demo.mp4`; needs a fresh `--demo` seed and the dev server running).

## Going live

1. **Entra app registration** (Plaksha IT): single tenant, redirect URI
   `https://<host>/api/auth/callback/microsoft`. Set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`
   and `MICROSOFT_TENANT_ID`.
2. **`SMTP_URL`** so email codes are actually delivered. Production refuses to start sending codes
   without it.
3. **`ADMIN_EMAILS`**, or `npm run make-admin -- someone@plaksha.edu.in`. Promote department staff
   from Admin → People.
4. Run `npm run sweep` from cron (hourly). The board also sweeps opportunistically.
5. Single node as built. To scale out, move rate limits to Postgres or Redis
   (`src/server/rate-limit.ts`), set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, and move images to
   S3/R2.

## Not built yet

Email and push notifications (in-app only today), a before/after photo slider, SLA escalation
emails, a building heat map, and editing an issue after posting.
