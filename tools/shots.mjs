// node tools/shots.mjs <email> <outdir> [path...]   — screenshot pages at desktop + mobile widths
import { mkdirSync } from "node:fs";
import { BASE, contextFor, launch } from "./session.mjs";

const [email, out = ".logs/shots", ...paths] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await launch();
for (const [label, viewport, scheme] of [["d", { width: 1440, height: 900 }, "light"], ["m", { width: 390, height: 844 }, "light"], ["dark", { width: 1440, height: 900 }, "dark"]]) {
  if (label === "dark" && !process.env.DARK) continue;
  const opts = { viewport, deviceScaleFactor: 1, colorScheme: scheme };
  const ctx = email === "-" ? await browser.newContext(opts) : await contextFor(browser, email, opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const p of paths) {
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(p.includes("board") ? 6000 : 700);
    const name = `${out}/${label}-${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}.png`;
    await page.screenshot({ path: name, fullPage: label !== "d" || !p.includes("board") });
    console.log(name);
  }
  if (errors.length) console.log("ERRORS", label, [...new Set(errors)].slice(0, 8));
  await ctx.close();
}
await browser.close();
