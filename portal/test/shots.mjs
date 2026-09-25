/* Screenshot every screen of the preview (sample data), in User view and,
   for the administrator screens, Admin view. Usage: node test/shots.mjs <outdir> */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const out = resolve(process.argv[2] || "shots");
const width = Number(process.env.WIDTH || 1366);
mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: exe });

const USER = [["home", ""], ["definitions", "definitions"], ["functions", "functions"], ["detail", "functions/CF-3020"],
  ["deadlines", "deadlines"], ["directory", "directory"], ["executives", "executives"], ["gaps", "gaps"], ["noaccess", "risk"]];
const ADMIN = [["admin-risk", "risk"], ["admin-reporting", "reporting"], ["admin-flags", "flags"], ["admin-gaps", "gaps"], ["admin-functions", "functions"], ["admin-detail", "functions/CF-3020"], ["admin-deadlines", "deadlines"], ["admin-directory", "directory"]];

const page = await browser.newPage({ viewport: { width, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
const base = "file://" + resolve("dist/preview.html");
await page.goto(base);
await page.waitForSelector(".hdr", { timeout: 10000 });
const shoot = async (name, hash) => {
  await page.evaluate(h => { window.location.hash = "#/" + h; }, hash);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, name + ".png"), fullPage: true });
};
for (const [n, h] of USER) await shoot(n, h);
await page.selectOption(".util-role select", "Admin");
for (const [n, h] of ADMIN) await shoot(n, h);
await browser.close();
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log("screenshots in " + out);
