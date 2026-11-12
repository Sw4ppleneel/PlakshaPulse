// Calls privileged server actions directly (bypassing the UI) as a plain member and as an
// anonymous client, to prove authorization is enforced server-side. Dev only.
//   node tools/attack.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { BASE, contextFor, launch } from "./session.mjs";

const manifest = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")).node;
const id = (name) => Object.entries(manifest).find(([, v]) => v.exportedName === name)?.[0];
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? `postgres://${process.env.USER}@localhost:5432/pulse_dev` });
await db.connect();
const { rows } = await db.query("select id, number, status from issues where status = 'in_progress' order by number limit 1");
const target = rows[0];

const browser = await launch();
const member = await contextFor(browser, "student.demo@plaksha.edu.in");
const page = await member.newPage();
await page.goto(`${BASE}/issues/${target.number}`);

async function call(ctxPage, action, routerPath, args, { anonymous = false } = {}) {
  return ctxPage.evaluate(
    async ({ action, routerPath, args, anonymous }) => {
      const body = new FormData();
      const isForm = args.__form;
      if (isForm) {
        // React's wire format for a single FormData argument
        body.append("0", '["$K1"]');
        for (const [k, v] of Object.entries(args.__form)) body.append(`1_${k}`, v);
      }
      const res = await fetch(routerPath, {
        method: "POST",
        credentials: anonymous ? "omit" : "include",
        headers: { "Next-Action": action, Accept: "text/x-component", ...(isForm ? {} : { "Content-Type": "text/plain;charset=UTF-8" }) },
        body: isForm ? body : JSON.stringify(args),
      });
      return { status: res.status, text: (await res.text()).slice(0, 600) };
    },
    { action, routerPath, args, anonymous },
  );
}

// 1. updateStatus with a genuine captured request is covered by tools/attack-replay.mjs

// 2. member tries to promote themselves to admin
const r2 = await call(page, id("setUserRole"), `/admin/people`, [{ userId: "demo-student", role: "admin" }]);
console.log("setUserRole(self→admin) as member →", r2.status, r2.text.match(/"error":"[^"]+"/)?.[0] ?? r2.text.slice(0, 120));
const role = (await db.query(`select role from "user" where id = 'demo-student'`)).rows[0].role;
assert.equal(role, "member", "role unchanged");

// 3. member tries to hide an issue
const r3 = await call(page, id("moderate"), `/admin`, [{ targetType: "issue", targetId: target.id, hide: true }]);
console.log("moderate as member →", r3.status, r3.text.match(/"error":"[^"]+"/)?.[0] ?? r3.text.slice(0, 120));
assert.equal((await db.query("select hidden from issues where id = $1", [target.id])).rows[0].hidden, false, "not hidden");

// 4. signed-out client tries to me-too
const votesBefore = (await db.query("select count(*)::int n from issue_votes where issue_id = $1", [target.id])).rows[0].n;
const r4 = await call(page, id("toggleMetoo"), `/`, [target.id], { anonymous: true });
console.log("toggleMetoo signed-out →", r4.status, r4.text.match(/"error":"[^"]+"/)?.[0] ?? r4.text.slice(0, 200));
assert.equal((await db.query("select count(*)::int n from issue_votes where issue_id = $1", [target.id])).rows[0].n, votesBefore, "no vote recorded");

// 5. signed-out JSON endpoints
for (const p of ["/api/issues/similar?q=wifi", `/api/attachments/${target.id}`]) {
  const r = await fetch(BASE + p);
  console.log(`GET ${p} signed-out →`, r.status);
  assert.equal(r.status, 401);
}

await browser.close();
await db.end();
console.log("\n✓ all privileged calls rejected server-side");
