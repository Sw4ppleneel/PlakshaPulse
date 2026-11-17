# Pulse · Plaksha

**Raise it once. Watch it move.** Pulse is one open board for everything students want changed at
Plaksha. It has two halves:

- **Issues** — something is broken. Report it once, everyone affected adds a *me too*, and the
  owning office resolves it in public.
- **Proposals** — something should exist. Changes on campus usually need a poll, then a trial run,
  then approval. A proposal collects that evidence as it goes, so the poll is already done by the
  time it reaches the office.

Only `@plaksha.edu.in` accounts can sign in, so every count is one real person on campus.

## Proposals

- **Support with intent.** Backing a proposal asks how often you'd use it (weekly, now and then,
  or just backing it), your batch, whether you'd volunteer to help run it, and an optional reason.
  One person, one count; re-submitting edits your answer.
- **A fixed path.** Show interest → take it to the office → trial run → decision. The proposer can
  record that they took it to an office; only that office or an admin can start a trial, adopt or
  decline. Every move needs a public note and notifies supporters.
- **Trials produce numbers too.** While a trial is running, people who used it check in once a day
  (worked well / okay / didn't work).
- **Evidence pack.** `/proposals/<n>/evidence` is a printable page with the ask, supporter count,
  growth over time, breakdown by batch and intended use, volunteers, supporters' reasons, trial
  results and the list of supporters who chose to be named. Print it or save it as a PDF and take
  it to the meeting.
- **Dated list view.** Proposals can be browsed as cards or as a list showing when each was
  proposed, when it last moved and when its trial runs.
- **Decisions stay on record.** Adopted and declined proposals remain visible with the reason, and
  their evidence is frozen.

## Issues

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
- **Admin.** An approval queue for everything members post, triage (untriaged, overdue, awaiting
  confirmation), a flag queue (five flags hide content automatically), roles (member / department
  staff / moderator / admin), suspensions and a private audit log.
- **Anonymity with accountability.** Other users don't see an anonymous reporter's name. Admins do.

A narrated 2-minute walkthrough is at [`demo/Pulse-demo.mp4`](demo/Pulse-demo.mp4).

## Stack

| | |
|---|---|
| App | Next.js 16.4 (App Router, server actions), React 19.3, TypeScript 5.9 |
| UI | Tailwind 4, Outfit, `motion` springs, lucide icons, sonner toasts, a canvas + d3-force bubble field |
| Data | PostgreSQL (`pg_trgm`), Drizzle ORM 0.45 |
| Auth | Better Auth 1.7: Microsoft Entra ID (single-tenant) plus 6-digit email codes |
| Images | Re-encoded with sharp and stored in Postgres, served only to signed-in users |

Plaksha's mail runs on Microsoft 365 (MX `plaksha-edu-in.mail.protection.outlook.com`, Entra tenant
`45798c33-1b43-4c01-bf3e-d8d655d3389c`), so sign-in is Microsoft or an emailed code, not Google.

### Interface

Soft, rounded and card-based: a warm grey canvas, white 28px cards, dark feature cards and one
mint accent. A sidebar at desktop widths, a floating bottom nav on phones. Each list page has one
row of controls (which items, search, a single Filters panel, view) and everything else is
progressive disclosure. Tokens live in `src/app/globals.css`; light and dark are token swaps, and
`.on-dark` re-points the tokens for anything inside a dark card. Motion is one spring and one
ease (`src/components/motion.tsx`), transform and opacity only, and honours reduced motion.

The design language (palette, radii, ticket shape, nav pattern) follows the kit in
[TravelTrack](https://github.com/justcreate-shaurya/TravelTrack), another Plaksha student project.

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
- **Nothing from a member is public until a moderator approves it.** New issues, proposals,
  comments, proposal posts and the written reason on a support are created hidden and `pending`.
  Until approved they are visible only to their author and to moderators: other members get a 404,
  they are absent from lists, search, counts and the evidence pack, and no notifications go out.
  Approving publishes the item and sends the held notifications; rejecting keeps it private and
  tells the author why. Offices, moderators and admins post directly. A separate **Moderator** role
  can approve, reject and hide content but cannot change roles or suspend people.
- **Spam limits.** Every write is counted in Postgres, so a limit holds across all server
  instances: 2 reports per 5 minutes and 5 a day, 1 proposal per 5 minutes and 3 a day, 4 comments
  a minute and 40 an hour, 20 me-toos a minute. One person can have at most 3 posts and 8 comments
  waiting in the approval queue, the same title or comment can't be posted twice, and sign-in codes
  are limited to 3 per inbox per 10 minutes. Community flags auto-hide content at 5, and
  everything a moderator does is in the audit log.
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

Other scripts: `npm run e2e` (issue loop across four accounts), `node tools/e2e-proposals.mjs`
(proposal pipeline plus its authorization checks), `node tools/e2e-moderation.mjs` (approval and
spam limits), `npm run security:check`,
`npm run shots -- <email> <outdir> /board /issues/1`, and `npm run demo:video` (re-records
`demo/Pulse-demo.mp4`; needs a fresh `--demo` seed and the dev server running).

## Going live

The app runs on Vercel with Neon Postgres (`pg_trgm` is available there).

1. **Database.** Set `DATABASE_URL` to the pooled Neon connection string. Run `npm run db:migrate`
   and `npm run db:seed` (taxonomy only) once against the unpooled one.
2. **Sign-in.** Either works; both can be on at once.
   - *Email codes:* set `SMTP_URL` (for Gmail: `smtps://you%40gmail.com:<app password>@smtp.gmail.com:465`)
     and `MAIL_FROM`. Gmail sends about 500 a day; `MAIL_DAILY_CAP` (default 450) stops short of it.
     A session lasts 30 days, so each person needs one code a month.
   - *Microsoft:* an Entra app registration from Plaksha IT (single tenant, redirect URI
     `https://<host>/api/auth/callback/microsoft`), then `MICROSOFT_CLIENT_ID` and
     `MICROSOFT_CLIENT_SECRET`.
3. **`BETTER_AUTH_URL`** is the public origin, and **`BETTER_AUTH_SECRET`** is 32+ random bytes.
4. **`ADMIN_EMAILS`** become admins on first sign-in (or `npm run make-admin -- someone@plaksha.edu.in`).
   Promote department staff from Admin → People.
5. **Moderators.** Make at least one more person a Moderator in Admin → People, otherwise every
   post waits on the admins.
6. **Storage.** Images are stored in Postgres, which is fine for a few thousand photos; move them
   to object storage beyond that.

## Not built yet

Email and push notifications (in-app only today), a before/after photo slider, SLA escalation
emails, a building heat map, editing an issue or proposal after posting, and merging duplicate
proposals.
