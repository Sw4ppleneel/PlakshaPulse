// Pre-moderation and spam limits, checked against the database. Dev only.
//   node tools/e2e-moderation.mjs      (needs `npm run db:seed -- --demo` and the dev server)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { BASE, contextFor, launch } from "./session.mjs";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? `postgres://${process.env.USER}@localhost:5432/pulse_dev` });
await db.connect();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const ok = (m) => console.log("  ✓", m);

const browser = await launch();
const student = await contextFor(browser, "student.demo@plaksha.edu.in");
const prof = await contextFor(browser, "faculty.demo@plaksha.edu.in");
const admin = await contextFor(browser, "admin.demo@plaksha.edu.in");
const s = await student.newPage();
const f = await prof.newPage();
const a = await admin.newPage();
// The dev server only registers a server action once a page that uses it has been compiled.
for (const path of ["/issues/new", "/issues/1", "/admin", "/admin/people"]) await a.goto(BASE + path, { waitUntil: "networkidle" });
await Promise.all([s.goto(`${BASE}/board`), f.goto(`${BASE}/board`), a.goto(`${BASE}/admin`)]);

const actionId = (name) => {
  const manifest = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")).node;
  const hit = Object.entries(manifest).find(([, v]) => v.exportedName === name)?.[0];
  assert.ok(hit, `server action ${name} not found`);
  return hit;
};
// Calls a server action directly, the way a script would, bypassing the UI.
const call = (page, name, args) =>
  page.evaluate(
    async ({ action, args }) => {
      const res = await fetch(location.pathname, {
        method: "POST",
        credentials: "include",
        headers: { "Next-Action": action, Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(args),
      });
      return (await res.text()).slice(0, 700);
    },
    { action: actionId(name), args },
  );
// Reports go through the real form. Returns "ok" or the error shown to the person.
async function report(page, title) {
  await page.goto(`${BASE}/issues/new`);
  await page.getByRole("button", { name: "Wi-Fi & IT" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Post to the board" }).click();
  const toast = page.locator("[data-sonner-toast]").first();
  return Promise.race([
    page.waitForURL(/\/issues\/\d+/, { timeout: 10000 }).then(() => "ok"),
    toast.waitFor({ timeout: 10000 }).then(() => toast.innerText()),
  ]);
}
const mine = `issues where reporter_id = 'demo-student' and title like 'Modtest%'`;

/* 1 · a member's report starts private */
console.log("approval");
let r = await report(s, "Modtest one — projector flickers in room 204");
const [one] = await q(`select id, number, approval, hidden from ${mine}`);
assert.deepEqual([one.approval, one.hidden], ["pending", true]);
assert.equal((await f.goto(`${BASE}/issues/${one.number}`)).status(), 404);
ok("a member's report is created hidden and pending; another member gets 404");

r = await call(f, "toggleMetoo", [one.id]);
assert.match(r, /Issue not found/);
ok("nobody can me-too a pending report");

/* 2 · a comment on a public issue is held, and nobody is notified */
const [pub] = await q("select id, number, comment_count from issues where approval = 'approved' and not hidden and status = 'in_progress' order by number limit 1");
const before = (await q("select count(*)::int n from notifications where issue_id = $1", [pub.id]))[0].n;
r = await call(s, "addComment", [{ issueId: pub.id, body: "Modtest comment: same here on the third floor.", anonymous: false, official: false }]);
const [c] = await q("select id, approval, hidden from comments where body like 'Modtest comment%'");
assert.deepEqual([c.approval, c.hidden], ["pending", true]);
assert.equal((await q("select comment_count n from issues where id = $1", [pub.id]))[0].n, pub.comment_count);
assert.equal((await q("select count(*)::int n from notifications where issue_id = $1", [pub.id]))[0].n, before);
await f.goto(`${BASE}/issues/${pub.number}`);
assert.equal(await f.getByText("Modtest comment").count(), 0);
await s.goto(`${BASE}/issues/${pub.number}`);
await s.getByText("Modtest comment").waitFor();
await s.getByText("Waiting for approval").first().waitFor();
ok("a member's comment is held: hidden from others, shown to its author as waiting, no notifications sent");

r = await call(s, "addComment", [{ issueId: pub.id, body: "Modtest comment: same here on the third floor.", anonymous: false, official: false }]);
assert.match(r, /already posted that/);
ok("the same comment can't be posted twice");

/* 3 · only moderators decide */
r = await call(s, "reviewContent", [{ kind: "issue", id: one.id, approve: true }]);
assert.match(r, /Moderators only/);
assert.equal((await q("select approval a from issues where id = $1", [one.id]))[0].a, "pending");
ok("a member cannot approve their own report");

r = await call(a, "reviewContent", [{ kind: "comment", id: c.id, approve: true }]);
assert.deepEqual(await q("select approval, hidden from comments where id = $1", [c.id]), [{ approval: "approved", hidden: false }]);
assert.equal((await q("select comment_count n from issues where id = $1", [pub.id]))[0].n, pub.comment_count + 1);
assert.ok((await q("select count(*)::int n from notifications where issue_id = $1", [pub.id]))[0].n > before);
await f.reload();
await f.goto(`${BASE}/issues/${pub.number}`);
await f.getByText("Modtest comment").waitFor();
ok("approving a comment publishes it, counts it and notifies followers");

r = await call(a, "reviewContent", [{ kind: "comment", id: c.id, approve: false }]);
assert.match(r, /already reviewed/);
ok("an item can only be decided once");

r = await call(a, "reviewContent", [{ kind: "issue", id: one.id, approve: false, note: "Please report this to the AV desk instead." }]);
assert.deepEqual(await q("select approval, hidden, hidden_reason from issues where id = $1", [one.id]), [{ approval: "rejected", hidden: true, hidden_reason: "Please report this to the AV desk instead." }]);
assert.equal((await f.goto(`${BASE}/issues/${one.number}`)).status(), 404);
await s.goto(`${BASE}/issues/${one.number}`);
await s.getByText("Not approved.").waitFor();
await s.getByText("Please report this to the AV desk instead.").waitFor();
assert.equal((await q("select count(*)::int n from notifications where user_id = 'demo-student' and kind = 'review' and issue_id = $1", [one.id]))[0].n, 1);
ok("a rejected report stays private; the author sees the reason and is notified");

/* 4 · a moderator role that isn't admin */
await db.query(`update "user" set role = 'mod' where id = 'demo-prof'`);
const modRes = await f.goto(`${BASE}/admin`);
assert.equal(modRes.status(), 200);
await f.getByRole("heading", { name: "Moderation", exact: true }).waitFor();
// the log shows who did what, and the rejected report is listed under Hidden with a Restore button
await f.locator("#log").getByText("rejected #").first().waitFor();
await f.locator("#hidden").getByText("Modtest one").waitFor();
assert.equal(await f.locator("#log").getByText("changed the role of").count(), 0, "role changes are admin-only in the log");
assert.equal((await f.goto(`${BASE}/admin/people`)).status(), 404);
r = await call(f, "setUserRole", [{ userId: "demo-prof", role: "admin" }]);
assert.equal((await q(`select role from "user" where id = 'demo-prof'`))[0].role, "mod");
ok("a moderator gets the queue, the log and the hidden list, but not People & roles, and can't promote themselves");
await f.goto(`${BASE}/admin`);
await f.locator("#hidden li", { hasText: "Modtest one" }).getByRole("button", { name: "Restore" }).click();
await f.getByText("Restored. It's public again.").waitFor();
assert.deepEqual(await q("select approval, hidden from issues where id = $1", [one.id]), [{ approval: "approved", hidden: false }]);
ok("Restore from the hidden list makes it public again");
await db.query(`update "user" set role = 'member' where id = 'demo-prof'`);

/* 5 · spam limits */
console.log("limits");
await db.query(`delete from rate_hits where key like 'createIssue:%demo-student'`);
await db.query(`delete from ${mine}`);
r = await report(s, "Modtest alpha — printer jam on floor two");
r = await report(s, "Modtest alpha — printer jam on floor two");
assert.match(r, /already reported this/);
ok("the same title can't be reported twice");
r = await report(s, "Modtest beta — door handle loose in block C");
r = await report(s, "Modtest gamma — vending machine eats coins");
assert.match(r, /Slow down/);
assert.equal((await q(`select count(*)::int n from ${mine}`))[0].n, 2);
ok("a third report inside five minutes is refused (2 per 5 minutes); refused attempts don't count");

// lift the burst window only; the queue cap still applies
await db.query(`delete from rate_hits where key like 'createIssue:300:%demo-student'`);
r = await report(s, "Modtest delta — stairwell light out");
await db.query(`delete from rate_hits where key like 'createIssue:300:%demo-student'`);
r = await report(s, "Modtest epsilon — water cooler leaking");
assert.match(r, /waiting for approval/);
assert.equal((await q(`select count(*)::int n from ${mine} and approval = 'pending'`))[0].n, 3);
ok("no more than 3 reports from one person can sit in the queue");

await db.query(`delete from rate_hits where key like 'comment:%demo-student'`);
let refused = 0;
for (let i = 0; i < 6; i++) {
  r = await call(s, "addComment", [{ issueId: pub.id, body: `Modtest burst ${i} ${Date.now()}`, anonymous: false, official: false }]);
  if (/Slow down/.test(r)) refused++;
}
assert.equal(refused, 2);
ok("comments are capped at 4 a minute");

// the counters live in Postgres, so they hold across server instances
assert.ok((await q("select count(*)::int n from rate_hits where key like 'comment:60:%demo-student'"))[0].n === 1);
ok("limits are counted in the database, not in server memory");

await db.query(`delete from comments where body like 'Modtest%'`);
await db.query(`delete from ${mine}`);
await db.query(`delete from rate_hits where key like '%demo-student' or key like '%demo-prof'`);
await db.query(`update issues set comment_count = (select count(*) from comments c where c.issue_id = issues.id and not c.hidden) where id = $1`, [pub.id]);
await db.end();
await browser.close();
console.log("\nAll moderation and limit checks passed.");
