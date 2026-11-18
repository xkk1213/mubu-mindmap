import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1.5 });
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(600);
const info = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".mbm-toolbar .mbm-btn")).map((b) => ({
    label: b.querySelector(".mbm-btn-label")?.textContent ?? null,
    aria: b.getAttribute("aria-label"),
    cls: b.className,
    w: b.offsetWidth,
    labelW: b.querySelector(".mbm-btn-label")?.offsetWidth ?? 0,
  }));
});
console.log(JSON.stringify(info, null, 1));
const tb = await page.evaluate(() => ({ w: document.querySelector(".mbm-toolbar").clientWidth, scrollW: document.querySelector(".mbm-toolbar").scrollWidth }));
console.log("toolbar:", JSON.stringify(tb));
await browser.close();
