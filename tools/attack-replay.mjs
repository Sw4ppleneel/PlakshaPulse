import pg from "pg";
import { BASE, contextFor, launch } from "./session.mjs";
const db = new pg.Client({ connectionString: `postgres://${process.env.USER}@localhost:5432/pulse_dev` });
await db.connect();
const t = (await db.query("select id, number, status from issues where status='in_progress' and department_id='it' order by number limit 1")).rows[0];
const browser = await launch();
// 1) capture a genuine updateStatus request from IT staff, without letting it reach the server
const staff = await contextFor(browser, "it.demo@plaksha.edu.in");
const sp = await staff.newPage();
await sp.goto(`${BASE}/issues/${t.number}`);
let captured;
await sp.route("**/issues/**", async (route) => {
  const req = route.request();
  if (req.method() === "POST" && req.headers()["next-action"]) { captured = { headers: req.headers(), body: req.postDataBuffer() }; return route.abort(); }
  return route.continue();
});
await sp.getByRole("button", { name: "Fixed · awaiting confirmation", exact: true }).click();
await sp.getByPlaceholder(/What was done/).fill("Replayed by an attacker — should never apply");
await sp.getByRole("button", { name: "Publish update" }).click();
for (let i = 0; i < 50 && !captured; i++) await sp.waitForTimeout(100);
// 2) replay the exact same request with a member's session, and with no session
for (const who of ["student.demo@plaksha.edu.in", null]) {
  const ctx = who ? await contextFor(browser, who) : await browser.newContext();
  const { cookie, ...h } = captured.headers;
  const res = await ctx.request.post(`${BASE}/issues/${t.number}`, { headers: { ...h, origin: BASE }, data: captured.body, maxRedirects: 0 });
  const txt = await res.text();
  console.log(who ?? "signed-out", "→", res.status(), txt.match(/"error":"[^"]+"/)?.[0] ?? txt.slice(0, 160));
}
const after = (await db.query("select status from issues where id=$1", [t.id])).rows[0].status;
console.log("status before/after:", t.status, after, after === t.status ? "✓ unchanged" : "✗ CHANGED");
await browser.close(); await db.end();
