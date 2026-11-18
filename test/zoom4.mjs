import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1.5 });
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(800);
await page.evaluate(() => window.mbm.highlight(12));
await page.waitForTimeout(700);
const hl = await page.evaluate(() => {
  const active = document.querySelector(".mbm-node.is-active");
  if (!active) return { found: false };
  const r = active.getBoundingClientRect();
  return {
    found: true,
    title: active.querySelector(".mbm-title")?.textContent?.slice(0, 20),
    inViewport: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
    centerOffset: Math.round(Math.abs(r.top + r.height / 2 - innerHeight / 2)),
  };
});
console.log("highlight:", JSON.stringify(hl));
await page.screenshot({ path: path.join(here, "shots", "zoom-highlight.png") });
// 折叠截图
await page.evaluate(() => window.mbm.collapseAll());
await page.waitForTimeout(500);
await page.evaluate(() => window.mbm.fit());
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(here, "shots", "zoom-collapsed.png") });
await browser.close();
