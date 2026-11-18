import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(800);
await page.evaluate(() => window.mbm.openCardOf("产品规划 Q4"));
await page.waitForTimeout(500);
const seen = [];
for (let i = 0; i < 24; i++) {
  const k = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"][i % 4];
  await page.keyboard.press(k);
  await page.waitForTimeout(90);
  seen.push((await page.evaluate(() => window.mbm.cardViewerInfo())).title);
}
console.log("distinct cards visited:", new Set(seen).size, "of", seen.length);
console.log("last:", seen[seen.length - 1]);
// 用 ‹ 按钮回退一次
await page.evaluate(() => document.querySelector(".mbm-lb-nav").click());
await page.waitForTimeout(250);
console.log("after prev button:", (await page.evaluate(() => window.mbm.cardViewerInfo())).title);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
console.log("closed:", await page.evaluate(() => window.mbm.cardViewerInfo()));
console.log("active after close:", await page.evaluate(() => window.mbm.view.canvas.getSelected()?.title));
console.log("errors:", errs);
await browser.close();
