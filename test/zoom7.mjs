import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1 });
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);
const rows = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".mbm-node")).map((n) => ({
    t: (n.querySelector(".mbm-title")?.textContent || "").slice(0, 14),
    w: n.offsetWidth,
    h: n.offsetHeight,
    styleW: n.style.width,
    cardW: n.querySelector(".mbm-card")?.offsetWidth,
  })).sort((a, b) => a.w - b.w).slice(0, 8)
);
console.log(JSON.stringify(rows, null, 1));
await browser.close();
