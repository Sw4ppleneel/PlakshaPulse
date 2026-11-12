// Records the narrated product demo against the running dev server with fresh demo data.
//   npm run db:seed -- --demo && node tools/demo-video.mjs
// Output: demo/Pulse-demo.mp4 (1440×900, H.264 + AAC). Narration: macOS `say` (Samantha).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import pg from "pg";
import { BASE, contextFor, launch } from "./session.mjs";

const OUT = "demo";
const TMP = ".logs/video";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });
const W = 1440;
const H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = new pg.Client({ connectionString: `postgres://${process.env.USER}@localhost:5432/pulse_dev` });
await db.connect();

/* ── narration ─────────────────────────────────────────────── */
const SCRIPT = {
  intro: "This is Pulse. One shared, public board for every campus issue at Plaksha.",
  problem:
    "Right now, issues go through a Q R ticket form. Your ticket disappears into an inbox. Nobody knows that forty other people reported the same thing. And updates get lost in WhatsApp groups.",
  landing: "Pulse puts every issue in the open, for students, faculty and administration alike.",
  signin: "Only Plaksha accounts can get in. Through Microsoft three sixty five, or a one-time code sent to your Plaksha inbox. No outsiders, and no throwaway accounts.",
  board:
    "This is the live board. Every open issue is a bubble. The more people affected, the bigger it grows, and it glows brighter with recent activity. At a glance, anyone can see that sixty five people are hit by the same Wi-Fi problem.",
  group: "Group bubbles by category, or switch to a list sorted by what's trending.",
  report:
    "Reporting takes seconds. As you type, Pulse finds matching issues, even when you use different words. So instead of filing a duplicate ticket, you add your voice with one tap.",
  issue:
    "Your me too counts instantly, and you're subscribed to every update. Each issue shows who owns it, the target time, and a public timeline that can't be quietly edited.",
  staff: "Department staff update issues right on the page. Marking something fixed means saying publicly what was done, and everyone affected is notified.",
  verify:
    "But fixed only counts when the people affected agree. Another student already said it's still cold. When a second person confirms, the issue reopens automatically. No more tickets closed on paper.",
  departments: "Every office's response time and on-time rate is computed live. Administration and faculty can see exactly where things are stuck.",
  fixed: "And every fix is logged publicly, with what was done and how long it took.",
  admin:
    "Admins get a triage queue, overdue alerts and a moderation queue. Students can post anonymously, but identity is verified behind the scenes, so it stays honest.",
  outro: "Pulse. Report once. Watch it grow. See it fixed.",
};
const CAPTIONS = {
  intro: "One public board for every campus issue",
  problem: "Today: QR tickets vanish, duplicates pile up, updates get lost",
  landing: "Everyone sees the same board — students, faculty, admin",
  signin: "Plaksha accounts only — Microsoft 365 or a code to your inbox",
  board: "Bubble size = people affected · glow = recent activity",
  group: "Group by category, or sort as a list",
  report: "Duplicate detection while you type → one-tap “me too”",
  issue: "Owner, target time and a permanent public timeline",
  staff: "Staff publish what was done — everyone affected is notified",
  verify: "Reporters confirm the fix — or it reopens",
  departments: "Live department scoreboard",
  fixed: "Public resolution log",
  admin: "Triage, moderation and verified-but-anonymous posting",
  outro: "Report once. Watch it grow. See it fixed.",
};
const dur = {};
for (const [k, text] of Object.entries(SCRIPT)) {
  execFileSync("say", ["-v", "Samantha", "-r", "182", "-o", `${TMP}/${k}.aiff`, text]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${TMP}/${k}.aiff`, "-ar", "48000", "-ac", "2", `${TMP}/${k}.wav`]);
  dur[k] = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${TMP}/${k}.wav`]).toString());
}
console.log("narration ready", Object.values(dur).reduce((a, b) => a + b, 0).toFixed(1) + "s");

/* ── accounts (signed in before recording, except the on-camera student login) ── */
const browser = await launch();
for (const email of ["facilities.demo@plaksha.edu.in", "admin.demo@plaksha.edu.in"]) {
  const c = await contextFor(browser, email);
  await c.close();
  await sleep(21_000); // respect the sign-in rate limit
}
const cookiesOf = (email) => JSON.parse(readFileSync(`.logs/state-${email}.json`, "utf8")).cookies;

const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: "light" });
await ctx.addInitScript(() => {
  const ss = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  };
  const css = `
    #__cur{position:fixed;z-index:2147483647;left:0;top:0;width:22px;height:22px;pointer-events:none;transform:translate(-3px,-2px);transition:transform .08s}
    #__cur.down{transform:translate(-3px,-2px) scale(.85)}
    .__ripple{position:fixed;z-index:2147483646;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;background:rgba(0,160,180,.35);pointer-events:none;animation:__r .5s ease-out forwards}
    @keyframes __r{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}
    #__cap{position:fixed;z-index:2147483645;left:32px;bottom:30px;max-width:640px;padding:12px 18px;border-radius:16px;background:rgba(16,46,77,.92);color:#fff;font:600 17px/1.35 "DM Sans",system-ui,sans-serif;box-shadow:0 10px 30px -10px rgba(0,0,0,.4);transition:opacity .35s,transform .35s}
    #__cap.hide{opacity:0;transform:translateY(8px)}
    #__cap b{color:#FFC35A;font-weight:700}
    #__tick{position:fixed;right:0;bottom:0;width:2px;height:2px;pointer-events:none;animation:__t .5s linear infinite}
    @keyframes __t{from{opacity:.01}to{opacity:.02}}`;
  const mount = () => {
    if (document.getElementById("__cur")) return;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    const c = document.createElement("div");
    c.id = "__cur";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.4-6.7L4 20z" fill="#102E4D" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const cap = document.createElement("div");
    cap.id = "__cap";
    cap.className = "hide";
    document.body.appendChild(cap);
    const tick = document.createElement("div");
    tick.id = "__tick"; // keeps the compositor emitting frames on static pages
    tick.style.background = "#000";
    document.body.appendChild(tick);
    const saved = ss.get("__cap");
    if (saved) {
      cap.textContent = saved;
      cap.className = "";
    }
    const pos = ss.get("__pos");
    if (pos) {
      const [x, y] = JSON.parse(pos);
      c.style.left = x + "px";
      c.style.top = y + "px";
    }
  };
  // React hydration can drop nodes injected into <body>; keep re-mounting until the page settles.
  setInterval(() => document.body && mount(), 250);
  addEventListener("mousemove", (e) => {
    const c = document.getElementById("__cur");
    if (c) {
      c.style.left = e.clientX + "px";
      c.style.top = e.clientY + "px";
    }
    ss.set("__pos", JSON.stringify([e.clientX, e.clientY]));
  }, true);
  addEventListener("mousedown", (e) => {
    document.getElementById("__cur")?.classList.add("down");
    const r = document.createElement("div");
    r.className = "__ripple";
    r.style.left = e.clientX + "px";
    r.style.top = e.clientY + "px";
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }, true);
  addEventListener("mouseup", () => document.getElementById("__cur")?.classList.remove("down"), true);
  window.__setCaption = (t) => {
    ss.set("__cap", t);
    const cap = document.getElementById("__cap");
    if (!cap) return;
    cap.className = "hide";
    setTimeout(() => {
      cap.textContent = t;
      cap.className = t ? "" : "hide";
    }, t ? 180 : 0);
  };
});

const page = await ctx.newPage();
// Frames straight from Chrome's compositor (DevTools screencast) — no extra binaries needed.
mkdirSync(`${TMP}/frames`, { recursive: true });
const frames = [];
const cdp = await ctx.newCDPSession(page);
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = `${TMP}/frames/${String(frames.length).padStart(6, "0")}.jpg`;
  writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, t: Date.now() }); // receipt time; compositor timestamps drift
  void metadata;
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
const t0 = Date.now();
const marks = [];
let mouse = { x: W / 2, y: H / 2 };

async function scene(key, fn = async () => {}) {
  const start = Date.now() - t0;
  marks.push({ key, start, wall: Date.now() });
  await page.evaluate((t) => window.__setCaption?.(t), CAPTIONS[key]).catch(() => {});
  const minMs = dur[key] * 1000 + 700;
  await Promise.all([fn(), sleep(minMs)]);
  console.log(`  ${key} @ ${(start / 1000).toFixed(1)}s`);
}
async function moveTo(x, y, steps = 28) {
  await page.mouse.move(x, y, { steps });
  mouse = { x, y };
}
async function click(locator, { delay = 350 } = {}) {
  await locator.waitFor({ state: "visible", timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await moveTo(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(delay);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}
async function type(locator, text, perChar = 55) {
  await click(locator);
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(perChar + Math.random() * 40);
  }
}
async function smoothScroll(px, ms = 1600) {
  await page.evaluate(
    ([px, ms]) =>
      new Promise((res) => {
        const y0 = scrollY;
        const t = performance.now();
        const step = (n) => {
          const k = Math.min(1, (n - t) / ms);
          scrollTo(0, y0 + px * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2));
          k < 1 ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      }),
    [px, ms],
  );
}
async function go(path) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
}
let studentCookies = [];
async function asUser(email) {
  await ctx.clearCookies();
  await ctx.addCookies(email === "student" ? studentCookies : cookiesOf(email));
}

const card = (inner) => `<!doctype html><html><head><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Fraunces:ital,opsz,wght@0,9..144,500;1,9..144,500&display=swap" rel="stylesheet">
<style>html,body{margin:0;height:100%;background:#f5f8f8;color:#102e4d;font-family:"DM Sans",system-ui}
.w{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background-image:radial-gradient(rgba(16,46,77,.08) 1px,transparent 1px);background-size:18px 18px}
h1{font:500 76px/1.02 Fraunces,serif;letter-spacing:-.02em;margin:24px 0 0}h1 i{color:#007878}p{font-size:24px;color:#5d7083;margin:18px 0 0}
.row{display:flex;gap:22px;margin-top:44px}.c{width:300px;padding:26px;border-radius:24px;background:#fff;border:1px solid #e0e9ec;text-align:left;font-size:19px;line-height:1.4;box-shadow:0 10px 30px -16px rgba(16,46,77,.25);opacity:0;transform:translateY(14px);animation:in .6s forwards}
.c b{display:block;font:500 30px Fraunces,serif;color:#d2323c;margin-bottom:6px}@keyframes in{to{opacity:1;transform:none}}
.fade{opacity:0;animation:in .8s .1s forwards}</style></head><body><div class="w">${inner}</div><div style="position:fixed;right:0;bottom:0;width:2px;height:2px;background:#000;animation:t .5s linear infinite"></div><style>@keyframes t{from{opacity:.01}to{opacity:.02}}</style></body></html>`;
const LOGO = `<svg width="86" height="86" viewBox="0 0 32 32"><circle cx="12" cy="18" r="9.5" fill="#007878"/><circle cx="22.5" cy="11" r="6" fill="#00A0B4" opacity=".9"/><circle cx="24.5" cy="23.5" r="3.6" fill="#FFC35A"/><path d="M6.5 18h3l1.6-3.6 2.4 7.2 1.6-3.6h2.4" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ── 1. intro ── */
await page.setContent(card(`<div class="fade">${LOGO}<h1>Every campus issue,<br><i>in the open.</i></h1><p>Pulse · for the Plaksha community</p></div>`), { waitUntil: "networkidle" });
await scene("intro");

/* ── 2. problem ── */
await page.setContent(
  card(`<div class="fade" style="font:600 15px 'DM Sans';letter-spacing:.14em;color:#5d7083">TODAY · THE QR TICKET</div>
  <div class="row">
   <div class="c" style="animation-delay:.2s"><b>Invisible</b>Your ticket disappears into an inbox. No one else can see it.</div>
   <div class="c" style="animation-delay:1.6s"><b>Duplicated</b>Forty people file the same Wi-Fi complaint — none of them know.</div>
   <div class="c" style="animation-delay:3.4s"><b>Lost</b>Updates live in WhatsApp threads and get buried by morning.</div>
  </div>`),
  { waitUntil: "networkidle" },
);
await scene("problem");

/* ── 3. landing ── */
await go("/");
await scene("landing", async () => {
  await sleep(1500);
  await smoothScroll(620, 2200);
  await sleep(1200);
  await smoothScroll(-620, 1400);
});

/* ── 4. sign in (real email-code flow) ── */
await scene("signin", async () => {
  await click(page.getByRole("link", { name: /Sign in with your Plaksha account/ }));
  await page.waitForURL(/signin/);
  const before = readFileSync(".logs/dev.log", "utf8").length;
  await type(page.getByPlaceholder("firstname.lastname"), "student.demo", 70);
  await click(page.getByRole("button", { name: /Email me a sign-in code/ }));
  let code;
  for (let i = 0; i < 60 && !code; i++) {
    await sleep(150);
    code = readFileSync(".logs/dev.log", "utf8").slice(before).match(/student\.demo@plaksha\.edu\.in\s*\n│ (\d{6})/)?.[1];
  }
  await page.getByLabel("6-digit code").waitFor();
  await sleep(900);
  await type(page.getByLabel("6-digit code"), code, 140);
  await page.waitForURL(/board/, { timeout: 15000 });
  studentCookies = await ctx.cookies();
});

/* ── 5. board ── */
await page.waitForLoadState("networkidle");
await scene("board", async () => {
  await sleep(1200);
  await smoothScroll(470, 1600);
  await sleep(2500);
  // find the biggest bubble on the canvas by sampling the sr-only list positions is not possible; sweep the field instead
  const canvas = page.locator("canvas").first();
  const b = await canvas.boundingBox();
  for (const [fx, fy] of [[0.35, 0.4], [0.55, 0.55], [0.7, 0.35], [0.45, 0.7]]) {
    await moveTo(b.x + b.width * fx, b.y + b.height * fy, 35);
    await sleep(1300);
  }
});

/* ── 6. group & list ── */
await scene("group", async () => {
  await click(page.getByRole("button", { name: "Group" }));
  await sleep(3500);
  await click(page.getByRole("tab", { name: "List" }));
  await sleep(1800);
});

/* ── 7. report with duplicate detection ── */
await scene("report", async () => {
  await click(page.getByRole("link", { name: /Report an issue/ }).first());
  await page.waitForURL(/issues\/new/);
  await sleep(700);
  await click(page.getByRole("button", { name: "Water & plumbing" }));
  await page.getByLabel("Location").selectOption("boys-residence");
  await sleep(500);
  await type(page.getByLabel("Title"), "no hot water in the morning", 70);
  await page.getByText("Is it one of these?").waitFor({ timeout: 10000 });
  await sleep(2600);
});
await scene("issue", async () => {
  await click(page.getByRole("button", { name: /Me too/ }).first());
  await page.waitForURL(/issues\/\d+/);
  await sleep(1800);
  await smoothScroll(520, 1800);
  await sleep(1500);
  await smoothScroll(-520, 1200);
});
const issueUrl = page.url();
const number = Number(issueUrl.match(/issues\/(\d+)/)[1]);

/* ── 8. staff marks it fixed ── */
await asUser("facilities.demo@plaksha.edu.in");
await go(`/issues/${number}`);
await scene("staff", async () => {
  await sleep(600);
  await click(page.getByRole("button", { name: "Fixed · awaiting confirmation", exact: true }));
  await type(page.getByPlaceholder(/What was done/), "Replaced the geyser timer and added a second heater. Hot water now runs till 10 am.", 28);
  await click(page.getByRole("button", { name: "Publish update" }));
  await page.getByText("Replaced the geyser timer").first().waitFor();
  await sleep(1200);
});

/* another affected student already disputed it */
const { rows } = await db.query(
  `select i.id, i.reopen_count, v.user_id from issues i join issue_votes v on v.issue_id = i.id
   where i.number = $1 and v.user_id not in ('demo-student') and v.user_id <> i.reporter_id limit 1`,
  [number],
);
await db.query(`insert into verifications (issue_id, user_id, round, fixed, note) values ($1, $2, $3, false, 'Block B still cold at 8:30') on conflict do nothing`, [
  rows[0].id,
  rows[0].user_id,
  rows[0].reopen_count,
]);

/* ── 9. reporter verification → reopen ── */
await asUser("student");
await go(`/issues/${number}`);
await scene("verify", async () => {
  await page.getByText("Is it actually fixed?").scrollIntoViewIfNeeded();
  await sleep(1500);
  await click(page.getByRole("button", { name: "Still broken" }));
  await type(page.getByPlaceholder("What's still wrong?"), "Still cold at 8:30 in Block B.", 45);
  await click(page.getByRole("button", { name: "Reopen request" }));
  await page.getByText("reopened this — still not fixed").waitFor({ timeout: 10000 });
  await page.getByText("reopened this — still not fixed").scrollIntoViewIfNeeded();
  await sleep(800);
});

/* ── 10. departments ── */
await scene("departments", async () => {
  await click(page.getByRole("link", { name: "Departments" }).first());
  await page.waitForURL(/departments/);
  await sleep(2200);
  await smoothScroll(380, 1800);
});

/* ── 11. fixed ── */
await scene("fixed", async () => {
  await click(page.getByRole("link", { name: "Fixed" }).first());
  await page.waitForURL(/fixed/);
  await sleep(1800);
  await smoothScroll(420, 2000);
});

/* ── 12. admin ── */
await asUser("admin.demo@plaksha.edu.in");
await go("/admin");
await scene("admin", async () => {
  await sleep(1500);
  await smoothScroll(520, 1800);
  await sleep(800);
  const hide = page.getByRole("button", { name: "Hide", exact: true }).first();
  if (await hide.count()) await click(hide);
  await sleep(1500);
});

/* ── 13. outro ── */
await page.setContent(card(`<div class="fade">${LOGO}<h1>Report once.<br>Watch it grow.<br><i>See it fixed.</i></h1><p>Pulse · built for Plaksha</p></div>`), { waitUntil: "networkidle" });
await scene("outro", () => sleep(1200));

await sleep(400);
await cdp.send("Page.stopScreencast");
await ctx.close();
await browser.close();
await db.end();

// Resample to a constant 30 fps by pointing each output frame at the latest captured frame.
// (ffmpeg's concat demuxer doesn't reliably honour per-image durations.)
const zero = frames[0].t;
const FPS = 30;
const end = frames.at(-1).t + 1500;
rmSync(`${TMP}/cfr`, { recursive: true, force: true });
mkdirSync(`${TMP}/cfr`);
for (let k = 0, j = 0; zero + (k * 1000) / FPS <= end; k++) {
  const t = zero + (k * 1000) / FPS;
  while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
  symlinkSync(`../frames/${frames[j].file.split("/").pop()}`, `${TMP}/cfr/${String(k).padStart(6, "0")}.jpg`);
}
const raw = `${TMP}/silent.mp4`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${TMP}/cfr/%06d.jpg`, "-vf", `scale=${W}:${H}:flags=lanczos`, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", raw], { stdio: "inherit" });
for (const m of marks) m.start = Math.max(0, m.wall - zero);

/* ── mux: narration placed at each scene's start ── */
const inputs = ["-i", raw];
const filters = [];
marks.forEach((m, i) => {
  inputs.push("-i", `${TMP}/${m.key}.wav`);
  filters.push(`[${i + 1}:a]adelay=${m.start + 250}|${m.start + 250}[a${i}]`);
});
filters.push(`${marks.map((_, i) => `[a${i}]`).join("")}amix=inputs=${marks.length}:normalize=0,volume=1.35[aout]`);
writeFileSync(`${TMP}/marks.json`, JSON.stringify(marks, null, 2));
execFileSync(
  "ffmpeg",
  [
    "-y", "-loglevel", "error", ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "0:v", "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
    `${OUT}/Pulse-demo.mp4`,
  ],
  { stdio: "inherit" },
);
console.log(`\n✓ ${OUT}/Pulse-demo.mp4`);
