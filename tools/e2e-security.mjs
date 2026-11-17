// Regression checks for the security review fixes. Dev only.
//   node tools/e2e-security.mjs      (needs `npm run db:seed -- --demo` and the dev server)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { BASE, contextFor, launch } from "./session.mjs";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? `postgres://${process.env.USER}@localhost:5432/pulse_dev` });
await db.connect();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const ok = (m) => console.log("  ✓", m);
const H = { "Content-Type": "application/json", Origin: BASE };

const browser = await launch();
const student = await contextFor(browser, "student.demo@plaksha.edu.in");
const admin = await contextFor(browser, "admin.demo@plaksha.edu.in");
const staff = await contextFor(browser, "it.demo@plaksha.edu.in");
const s = await student.newPage();
const a = await admin.newPage();
const st = await staff.newPage();
for (const path of ["/issues/new", "/issues/1", "/admin", "/proposals/1", "/proposals/new"]) await a.goto(BASE + path, { waitUntil: "networkidle" });

const actionId = (name) => {
  const manifest = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")).node;
  const hit = Object.entries(manifest).find(([, v]) => v.exportedName === name)?.[0];
  assert.ok(hit, `server action ${name} not found`);
  return hit;
};
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

/* sign-in */
console.log("sign-in");
let res = await s.request.get(`${BASE}/signin?next=${encodeURIComponent("/\t/evil.com")}`, { maxRedirects: 0 });
assert.equal(res.status(), 307);
assert.equal(new URL(res.headers().location, BASE).host, new URL(BASE).host, `redirected off-site: ${res.headers().location}`);
res = await s.request.get(`${BASE}/signin?next=${encodeURIComponent("//evil.com")}`, { maxRedirects: 0 });
assert.equal(new URL(res.headers().location, BASE).host, new URL(BASE).host);
ok("?next= can't send a signed-in person to another site");

const anon = await browser.newContext();
await anon.request.get(`${BASE}/signin`);
const send = (email, ctx = anon) => ctx.request.post(`${BASE}/api/auth/email-otp/send-verification-otp`, { data: { email, type: "sign-in" }, headers: H });
res = await send("student.demo+2@plaksha.edu.in");
assert.equal(res.status(), 403);
ok("plus-addressed variants of an address are refused");

const forged = await browser.newContext();
await forged.addCookies([{ name: "pulse_device", value: "11111111-1111-1111-1111-111111111111", url: BASE }]);
res = await send("forged.cookie@plaksha.edu.in", forged);
assert.equal(res.status(), 400);
ok("a made-up browser id is refused");

res = await send("student.demo@plaksha.edu.in");
assert.equal(res.status(), 200);
const other = await browser.newContext();
await other.request.get(`${BASE}/signin`);
res = await other.request.post(`${BASE}/api/auth/sign-in/email-otp`, { data: { email: "student.demo@plaksha.edu.in", otp: "000000" }, headers: H });
assert.equal(res.status(), 400);
assert.match(await res.text(), /same browser/);
ok("a code can only be used in the browser that asked for it (no remote lock-out)");

res = await s.request.post(`${BASE}/api/auth/update-user`, { data: { name: "IT Department" }, headers: H });
assert.equal(res.status(), 404);
assert.notEqual((await q(`select name from "user" where id = 'demo-student'`))[0].name, "IT Department");
ok("people can't rename themselves through the auth API");

res = await send("other.type@plaksha.edu.in");
res = await anon.request.post(`${BASE}/api/auth/email-otp/send-verification-otp`, { data: { email: "x.y@plaksha.edu.in", type: "forget-password" }, headers: H });
assert.equal(res.status(), 400);
res = await anon.request.post(`${BASE}/api/auth/email-otp/reset-password`, { data: { email: "x.y@plaksha.edu.in", otp: "000000", password: "aaaaaaaa" }, headers: H });
assert.equal(res.status(), 404);
ok("unused auth endpoints are switched off");

/* content */
console.log("content");
assert.equal((await s.goto(`${BASE}/issues/99999999999`)).status(), 404);
ok("an out-of-range number is a 404, not a server error");

let r = await call(s, "supportProposal", [{ proposalId: (await q("select id from proposals where number = 2"))[0].id, usage: "often", volunteer: false, showName: true, reason: "", cohort: "lol go to evil.example" }]);
assert.match(r, /Pick your batch/);
ok("batch must be one of the listed options");

// a proposer's stage note waits for review; the stage change itself is public
const [p2] = await q("select id, number, author_id from proposals where stage = 'gathering' and approval = 'approved' order by number limit 1");
await db.query(`update proposals set author_id = 'demo-student', department_id = 'academics' where id = $1`, [p2.id]);
r = await call(s, "moveProposal", [{ proposalId: p2.id, to: "in_review", note: "Unreviewed text that should not be public yet" }]);
assert.match(r, /"ok":true/);
const notes = await q("select kind, body, hidden, approval from proposal_posts where proposal_id = $1 and body like 'Unreviewed%'", [p2.id]);
assert.deepEqual(notes, [{ kind: "update", body: "Unreviewed text that should not be public yet", hidden: true, approval: "pending" }]);
assert.equal((await q("select count(*)::int n from proposal_posts where proposal_id = $1 and kind = 'stage' and to_stage = 'in_review' and body is null", [p2.id]))[0].n, 1);
r = await call(s, "moveProposal", [{ proposalId: p2.id, to: "gathering", note: "" }]);
r = await call(s, "moveProposal", [{ proposalId: p2.id, to: "in_review", note: "Third move inside ten minutes" }]);
assert.match(r, /Slow down/);
ok("a proposer's note is held for review, and back-and-forth moves are capped");
await db.query(`update proposals set author_id = $2 where id = $1`, [p2.id, p2.author_id]);

// staff can't merge into something that isn't public, and get the same answer as for a missing one
const [live] = await q("select id from issues where department_id = 'it' and approval = 'approved' and not hidden and status in ('open','acknowledged','in_progress') order by number limit 1");
const [hiddenOne] = await q("select number from issues where hidden or approval <> 'approved' order by number limit 1").then(async (rows) => {
  if (rows.length) return rows;
  await db.query("update issues set hidden = true where number = 30");
  return [{ number: 30 }];
});
await st.goto(`${BASE}/issues/1`);
r = await call(st, "mergeIssue", [{ issueId: live.id, targetNumber: hiddenOne.number }]);
assert.match(r, /Issue not found/);
ok("merging into a hidden or pending issue is refused without revealing it");

// flags on hidden content are refused
const [hid] = await q("select id from issues where hidden limit 1");
r = await call(s, "flagContent", [{ targetType: "issue", targetId: hid.id, reason: "Other" }]);
assert.match(r, /Not found/);
ok("hidden content can't be flagged (or probed)");

// official replies are never auto-hidden by flags
const [official] = await q("select c.id, c.issue_id from comments c join issues i on i.id = c.issue_id where c.official and not c.hidden and not i.hidden and i.approval = 'approved' limit 1");
await db.query("insert into flags (target_type, target_id, issue_id, user_id, reason) select 'comment', $1, $2, id, 'Other' from \"user\" where role = 'member' and id <> 'demo-student' limit 4", [official.id, official.issue_id]);
r = await call(s, "flagContent", [{ targetType: "comment", targetId: official.id, reason: "Other" }]);
assert.equal((await q("select hidden from comments where id = $1", [official.id]))[0].hidden, false);
ok("an office's official reply stays up after 5 flags (it goes to the flag queue instead)");
await db.query("delete from flags where target_id = $1", [official.id]);

// the hidden list doesn't name anonymous reporters to non-admin moderators
await db.query("update issues set anonymous = true, hidden = true where id = (select id from issues where reporter_id <> 'demo-prof' and approval = 'approved' order by number desc limit 1)");
await db.query(`update "user" set role = 'mod' where id = 'demo-prof'`);
const prof = await contextFor(browser, "faculty.demo@plaksha.edu.in");
const f = await prof.newPage();
await f.goto(`${BASE}/admin`);
const anonRow = await q(`select u.name from issues i join "user" u on u.id = i.reporter_id where i.anonymous and i.hidden order by i.number desc limit 1`);
assert.equal(await f.locator("#hidden").getByText(anonRow[0].name).count(), 0);
await f.locator("#hidden").getByText("Posted anonymously").first().waitFor();
ok("moderators don't see who posted anonymously");
await db.query(`update "user" set role = 'member' where id = 'demo-prof'`);

await db.end();
await browser.close();
console.log("\nAll security regression checks passed.");
