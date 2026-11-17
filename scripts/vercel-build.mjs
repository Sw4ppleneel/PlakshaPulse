// Vercel runs this instead of `next build`. Only a production build migrates the database and
// loads the campus taxonomy; preview and development builds never touch it, whatever env vars they have.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
if (process.env.VERCEL_ENV === "production") {
  run("tsx scripts/migrate.ts");
  run("tsx scripts/seed.ts");
} else {
  console.log(`Skipping migrations and seed for VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}`);
}
run("next build");
