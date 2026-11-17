// Proposal flow end to end, plus the authorization checks that matter for it. Dev only.
//   node tools/e2e-proposals.mjs      (needs `npm run db:seed -- --demo` and the dev server)
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

/* 1 · student proposes */
console.log("propose");
const s = await student.newPage();
await s.goto(`${BASE}/proposals/new`);
await s.getByRole("button", { name: "Spaces & access" }).click();
await s.getByLabel("Title").fill("Open the terrace for evening study");
await s.getByLabel("The ask").fill("Open the academic block terrace from 6 pm to 10 pm on weekdays with seating.");
await s.getByRole("button", { name: "50", exact: true }).click();
await s.getByRole("button", { name: /Post proposal/ }).click();
await s.waitForURL(/\/proposals\/\d+$/);
const number = Number(s.url().split("/").pop());
const [prop] = await q("select id, support_count, stage, goal from proposals where number = $1", [number]);
assert.equal(prop.support_count, 1);
assert.equal(prop.goal, 50);
ok(`created P-${number}; author is supporter #1`);

/* 1b · private until approved */
console.log("approval");
await s.getByText("Waiting for a moderator.").waitFor();
const peek = await prof.newPage();
assert.equal((await peek.goto(`${BASE}/proposals/${number}`)).status(), 404);
await peek.goto(`${BASE}/proposals`);
assert.equal(await peek.getByText("Open the terrace for evening study").count(), 0);
await peek.close();
ok("pending proposal is invisible to other members");
const a0 = await admin.newPage();
await a0.goto(`${BASE}/proposals/${number}`);
await a0.getByRole("button", { name: "Approve" }).click();
await a0.getByText("Approved. It's public now.").waitFor();
await a0.close();
assert.deepEqual(await q("select approval, hidden from proposals where id = $1", [prop.id]), [{ approval: "approved", hidden: false }]);
assert.equal((await q("select count(*)::int n from notifications where proposal_id = $1 and user_id = 'demo-student' and kind = 'review'", [prop.id]))[0].n, 1);
ok("admin approved it on the page; author notified");

/* 2 · faculty supports it, with intent */
console.log("support");
const f = await prof.newPage();
await f.goto(`${BASE}/proposals/${number}`);
await f.getByRole("button", { name: "I want this" }).click();
await f.getByLabel("I'd use it now and then").check();
await f.getByLabel("Your batch or group").selectOption("Faculty");
await f.getByLabel(/Why does this matter/).fill("Office hours outdoors would be a welcome change.");
await f.getByLabel(/I'll help make it happen/).check();
await f.getByRole("button", { name: "Add my support" }).click();
await f.getByText("You support this").waitFor();
const [sup] = await q("select usage, volunteer, cohort, reason from proposal_supports where proposal_id = $1 and user_id = 'demo-prof'", [prop.id]);
assert.deepEqual([sup.usage, sup.volunteer, sup.cohort], ["sometimes", true, "Faculty"]);
assert.equal((await q("select support_count n from proposals where id = $1", [prop.id]))[0].n, 2);
ok("support recorded with usage, cohort, reason, volunteer; count = 2");
// faculty.demo is a member, so the written reason is held for review while the support counts
assert.equal((await q("select reason_approval a from proposal_supports where proposal_id = $1 and user_id = 'demo-prof'", [prop.id]))[0].a, "pending");
await f.goto(`${BASE}/proposals/${number}/evidence`);
assert.equal(await f.getByText("Office hours outdoors").count(), 0);
await f.goto(`${BASE}/proposals/${number}`);
ok("the reason is not in the evidence until approved");

// supporting twice edits, never double-counts
await f.getByRole("button", { name: "Edit my response" }).click();
await f.getByLabel("I'd use it every week").check();
await f.getByRole("button", { name: "Save" }).click();
await f.waitForTimeout(600);
assert.equal((await q("select count(*)::int n from proposal_supports where proposal_id = $1", [prop.id]))[0].n, 2);
assert.equal((await q("select usage from proposal_supports where proposal_id = $1 and user_id = 'demo-prof'", [prop.id]))[0].usage, "often");
ok("re-submitting edits the same row (one person, one count)");

/* 3 · authorization: call the server actions directly, bypassing the UI */
console.log("authorization");
const manifest = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")).node;
const actionId = (name) => {
  const hit = Object.entries(manifest).find(([, v]) => v.exportedName === name)?.[0];
  assert.ok(hit, `server action ${name} not found in manifest`);
  return hit;
};
const call = (page, name, args, anonymous = false) =>
  page.evaluate(
    async ({ action, args, anonymous }) => {
      const res = await fetch(location.pathname, {
        method: "POST",
        credentials: anonymous ? "omit" : "include",
        headers: { "Next-Action": action, Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(args),
      });
      return { status: res.status, text: (await res.text()).slice(0, 500) };
    },
    { action: actionId(name), args, anonymous },
  );
const stage = async () => (await q("select stage from proposals where id = $1", [prop.id]))[0].stage;

let r = await call(f, "moveProposal", [{ proposalId: prop.id, to: "adopted", note: "I hereby approve this myself." }]);
assert.equal(await stage(), "gathering");
assert.match(r.text, /Only the proposer/);
ok("a supporter cannot move someone else's proposal");

r = await call(s, "moveProposal", [{ proposalId: prop.id, to: "adopted", note: "Approving my own proposal, thanks." }]);
assert.equal(await stage(), "gathering");
ok("the proposer cannot mark their own proposal adopted");

r = await call(s, "moveProposal", [{ proposalId: prop.id, to: "trial", note: "", trialStartsOn: "2026-11-01", trialEndsOn: "2026-12-30" }]);
assert.equal(await stage(), "gathering");
ok("the proposer cannot start a trial on their own");

r = await call(f, "reviewContent", [{ kind: "reason", id: `${prop.id}:demo-prof`, approve: true }]);
assert.equal((await q("select reason_approval a from proposal_supports where proposal_id = $1 and user_id = 'demo-prof'", [prop.id]))[0].a, "pending");
assert.match(r.text, /Moderators only/);
ok("a member cannot approve their own content");

r = await call(f, "setProposalHidden", [prop.id, true]);
assert.equal((await q("select hidden from proposals where id = $1", [prop.id]))[0].hidden, false);
ok("a member cannot hide a proposal");

r = await call(f, "supportProposal", [{ proposalId: prop.id, usage: "often", volunteer: false, showName: true, reason: "", cohort: "Faculty" }], true);
assert.equal((await q("select count(*)::int n from proposal_supports where proposal_id = $1", [prop.id]))[0].n, 2);
ok("a signed-out request cannot add support");

r = await call(f, "checkIn", [{ proposalId: prop.id, rating: 3, note: "" }]);
assert.equal((await q("select count(*)::int n from trial_checkins where proposal_id = $1", [prop.id]))[0].n, 0);
ok("no check-ins outside a trial");

r = await call(s, "withdrawSupport", [prop.id]);
assert.equal((await q("select count(*)::int n from proposal_supports where proposal_id = $1 and user_id = 'demo-student'", [prop.id]))[0].n, 1);
ok("the proposer's own support can't be withdrawn");

/* 4 · proposer takes it to the office; admin starts a trial; supporter checks in; admin adopts */
console.log("pipeline");
await s.reload();
await s.getByRole("button", { name: "Take it to the office" }).click();
await s.getByPlaceholder(/Who did you take it to/).fill("Met the Student Life Office on Tuesday with the evidence pack.");
await s.getByRole("button", { name: "Confirm" }).click();
await s.getByText("Pick the office this is with").waitFor();
ok("an office has to be chosen before it counts as with the office");
await s.getByLabel("Owning office").selectOption("student-life");
await s.getByRole("button", { name: "Confirm" }).click();
await s.getByText("Supporters have been notified").waitFor();
assert.equal(await stage(), "in_review");
assert.deepEqual(await q("select approval, hidden from proposal_posts where proposal_id = $1 and body like 'Met the Student Life Office%'", [prop.id]), [{ approval: "pending", hidden: true }]);
ok("the proposer's note waits for a moderator; the move itself is public");
assert.equal((await q("select count(*)::int n from notifications where proposal_id = $1 and user_id = 'demo-prof' and kind = 'stage'", [prop.id]))[0].n, 1);
ok("proposer moved it to the office; supporter notified");

const a = await admin.newPage();
await a.goto(`${BASE}/proposals/${number}`);
await a.getByRole("button", { name: "Start a trial run" }).click();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const later = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + 10 * 86_400_000));
await a.getByLabel("Starts").fill(today);
await a.getByLabel("Ends").fill(later);
await a.getByRole("button", { name: "Confirm" }).click();
await a.getByText("Supporters have been notified").waitFor();
assert.equal(await stage(), "trial");
ok("admin started a trial");

await f.reload();
await f.getByRole("button", { name: "Worked well" }).click();
await f.getByRole("button", { name: "Check in" }).click();
await f.getByText("Logged.").waitFor();
await f.getByRole("button", { name: "It was okay" }).click();
await f.getByRole("button", { name: "Check in" }).click();
await f.waitForTimeout(700);
const checkins = await q("select rating from trial_checkins where proposal_id = $1", [prop.id]);
assert.equal(checkins.length, 1);
assert.equal(checkins[0].rating, 2);
ok("one check-in per person per day (second one replaces the first)");

await a.reload();
await a.getByRole("button", { name: "Mark adopted" }).click();
await a.getByPlaceholder(/What was approved/).fill("Approved from next Monday, weekdays 6 to 10 pm.");
await a.getByRole("button", { name: "Confirm" }).click();
await a.getByText("Supporters have been notified").waitFor();
assert.equal(await stage(), "adopted");
ok("admin adopted it with a public note");

r = await call(f, "withdrawSupport", [prop.id]);
assert.equal((await q("select count(*)::int n from proposal_supports where proposal_id = $1", [prop.id]))[0].n, 2);
ok("evidence is frozen once a proposal is decided");

/* 5 · evidence pack + list views render */
const res = await f.goto(`${BASE}/proposals/${number}/evidence`);
assert.equal(res.status(), 200);
await f.getByText("verified supporters").first().waitFor();
await f.goto(`${BASE}/proposals?show=done&mode=list`);
await f.getByText("Open the terrace for evening study").waitFor();
ok("evidence pack and dated list render");

await db.query("delete from proposals where id = $1", [prop.id]);
await db.end();
await browser.close();
console.log("\nAll proposal checks passed.");
