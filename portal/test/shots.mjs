/* Render the preview (and optionally the original design) and screenshot
   each screen. Usage: node test/shots.mjs <outdir> [--design <file>] */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const out = resolve(process.argv[2] || "shots");
const di = process.argv.indexOf("--design");
const design = di > 0 ? resolve(process.argv[di + 1]) : null;
mkdirSync(out, { recursive: true });
const exe = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: exe });

const ROUTES = [
  ["home", ""], ["definitions", "definitions"], ["functions", "functions"], ["functions-topic", "functions?lens=topic"],
  ["detail", "functions/CF-3020"], ["deadlines", "deadlines"], ["directory", "directory"], ["executives", "executives"],
  ["gaps", "gaps"], ["risk", "risk"], ["reporting", "reporting"]
];

async function port() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
  const base = "file://" + resolve("dist/preview.html");
  for (const [name, hash] of ROUTES) {
    await page.goto(base + "#/" + hash);
    await page.waitForSelector(".hdr", { timeout: 10000 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(out, "port-" + name + ".png"), fullPage: true });
  }
  await page.close();
  return errors;
}

async function original() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("file://" + design);
  await page.waitForSelector(".hdr", { timeout: 30000 });
  await page.waitForTimeout(1500);
  const click = async (text, sel = "button") => { await page.locator(sel, { hasText: text }).first().click(); await page.waitForTimeout(400); };
  const nav = async steps => { await click("Home", ".cm-nav button"); for (const s of steps) await s(); };
  const menu = (label, item) => [() => click(label, ".cm-nav .navbtn"), () => click(item, ".menu .mi")];
  const plan = {
    home: [],
    definitions: [() => click("Definitions", ".cm-nav .navbtn")],
    functions: menu("Browse", "Functions"),
    "functions-topic": [...menu("Browse", "Functions"), () => click("Risk Areas", ".mx-lens button")],
    detail: [async () => { await page.locator(".hm-assigned .srow", { hasText: "Clery Act Annual Security Report" }).first().click(); await page.waitForTimeout(500); }],
    deadlines: menu("Browse", "Deadlines"),
    directory: menu("Browse", "Directory"),
    executives: [() => click("Executive Team", ".cm-nav .navbtn")],
    gaps: menu("Risk and Reporting", "Gap Tracker"),
    risk: menu("Risk and Reporting", "Risk Dashboard"),
    reporting: menu("Risk and Reporting", "Reporting")
  };
  for (const [name] of ROUTES) {
    try {
      await nav(plan[name]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(out, "design-" + name + ".png"), fullPage: true });
    } catch (e) { console.log("design " + name + " failed: " + e.message.split("\n")[0]); }
  }
  await page.close();
}

const errs = await port();
if (design) await original();
await browser.close();
console.log(errs.length ? errs.join("\n") : "port: no console errors or warnings");
