/** Cron entry point: same housekeeping the app runs on page loads, forced. npm run sweep */
import "dotenv/config";

const { sweep } = await import("../src/server/sweep");
const n = await sweep(true);
console.log(`✓ sweep: ${n} issue(s) auto-closed`);
process.exit(0);
