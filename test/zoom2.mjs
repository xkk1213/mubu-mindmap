import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 });
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(800);
await page.evaluate(() => window.mbm.zoom(1));
await page.waitForTimeout(400);
// 找到两个正文节点并截图
const targets = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".mbm-node")).filter((n) =>
    n.querySelector(".mbm-body")
  ).map((n) => ({ t: (n.querySelector(".mbm-title")?.textContent || "").slice(0, 12), x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight }));
});
console.log(JSON.stringify(targets, null, 1));
await page.screenshot({ path: path.join(here, "shots", "zoom-body1.png"), clip: { x: 0, y: 0, width: 750, height: 470 } });
await page.screenshot({ path: path.join(here, "shots", "zoom-body2.png"), clip: { x: 380, y: 200, width: 750, height: 500 } });
await browser.close();
