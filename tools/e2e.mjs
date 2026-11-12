// End-to-end walk through the core loop with four real accounts (dev server + demo seed required):
//   node tools/e2e.mjs
// student files (sees duplicate suggestion) → faculty me-too → IT staff acknowledge + resolve
// → student says "still broken" → reopened. Also checks role gates.
import assert from "node:assert/strict";
import { BASE, contextFor, launch } from "./session.mjs";

const browser = await launch();
const opts = { viewport: { width: 1360, height: 900 } };
const step = (s) => console.log("•", s);

/* student files a new issue */
const student = await contextFor(browser, "student.demo@plaksha.edu.in", opts);
let page = await student.newPage();
await page.goto(`${BASE}/issues/new`);
await page.getByRole("button", { name: "Wi-Fi & IT" }).click();
await page.getByLabel("Location").selectOption("boys-residence");
await page.getByLabel("Title").fill("Internet slow in hostel every night");
await page.getByText("Is it one of these?").waitFor({ timeout: 8000 });
const suggestion = await page.getByText("Wi-Fi drops every evening").count();
assert.ok(suggestion > 0, "duplicate suggestion shown");
step("duplicate suggestion surfaced for a synonym-only match");
await page.getByText("None of these — mine is different").click();
const title = `Wi-Fi dead in boys' residence common room ${Date.now() % 10000}`;
await page.getByLabel("Title").fill(title);
await page.getByLabel("Description").fill("No signal at all in the ground-floor common room since Monday.");
await page.getByRole("button", { name: "Post to the board" }).click();
await page.waitForURL(/\/issues\/\d+/);
const number = Number(page.url().match(/issues\/(\d+)/)[1]);
await page.getByRole("heading", { name: title }).waitFor();
step(`student filed #${number}`);

/* student can't reach admin */
const adminRes = await page.goto(`${BASE}/admin`);
assert.equal(adminRes.status(), 404, "member blocked from /admin");
step("member gets 404 on /admin");

/* faculty me-too */
const faculty = await contextFor(browser, "faculty.demo@plaksha.edu.in", opts);
const fp = await faculty.newPage();
await fp.goto(`${BASE}/issues/${number}`);
await fp.getByRole("button", { name: /Affected too/ }).click();
await fp.getByText("You're affected — following").waitFor();
step("faculty added a me-too (count now 2)");

/* IT staff acknowledge → resolve */
const staff = await contextFor(browser, "it.demo@plaksha.edu.in", opts);
const sp = await staff.newPage();
await sp.goto(`${BASE}/issues/${number}`);
await sp.getByText("Manage this issue").waitFor();
await sp.getByRole("button", { name: "Acknowledged", exact: true }).click();
await sp.getByRole("button", { name: "Publish update" }).click();
await sp.getByText("moved this to Acknowledged").waitFor();
step("IT staff acknowledged");
await sp.getByRole("button", { name: "Fixed · awaiting confirmation", exact: true }).click();
await sp.getByPlaceholder(/What was done/).fill("Replaced the faulty access point in the common room; tested 300 Mbps.");
await sp.getByRole("button", { name: "Publish update" }).click();
await sp.getByText("Replaced the faulty access point").first().waitFor();
step("IT staff marked it fixed with a public note");

/* facilities staff (different dept) cannot manage it */
const fac = await contextFor(browser, "facilities.demo@plaksha.edu.in", opts);
const fac1 = await fac.newPage();
await fac1.goto(`${BASE}/issues/${number}`);
assert.equal(await fac1.getByText("Manage this issue").count(), 0, "other department has no manage panel");
step("staff from another department can't manage it");

/* student: still broken → reopened */
page = await student.newPage();
await page.goto(`${BASE}/issues/${number}`);
await page.getByText("Is it actually fixed?").waitFor();
await page.getByRole("button", { name: "Still broken" }).click();
await page.getByPlaceholder("What's still wrong?").fill("Still no signal near the sofas.");
await page.getByRole("button", { name: "Reopen request" }).click();
await page.getByText("reopened this — still not fixed").waitFor();
step("reporter said still broken → issue reopened");

/* notifications reached the student */
const unread = await page.getByRole("button", { name: /Notifications, \d+ unread/ }).count();
assert.ok(unread > 0, "student has unread notifications");
step("reporter received notifications");

await browser.close();
console.log(`\n✓ e2e passed on #${number}`);
