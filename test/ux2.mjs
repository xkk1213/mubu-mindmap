import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.6 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);

// 平移：先点空白处让画布拿到焦点
const before = await page.evaluate(() => document.querySelector(".mbm-stage").style.transform);
await page.mouse.click(700, 820);
await page.keyboard.press("ArrowDown");
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(250);
const after = await page.evaluate(() => document.querySelector(".mbm-stage").style.transform);
console.log("pan:", before, "->", after, "| active:", await page.evaluate(() => document.activeElement?.className));

// 放大后滚动条应出现
await page.evaluate(() => window.mbm.zoom(2));
await page.waitForTimeout(300);
console.log("vbar:", JSON.stringify(await page.evaluate(() => {
  const b = document.querySelector(".mbm-vbar"), t = document.querySelector(".mbm-vbar-thumb");
  const br = b.getBoundingClientRect(), tr = t.getBoundingClientRect();
  return { hidden: b.classList.contains("is-hidden"), barH: Math.round(br.height), thumbH: Math.round(tr.height), top: Math.round(tr.top) };
})));
// 拖动滑块
const tb = await page.evaluate(() => {
  const r = document.querySelector(".mbm-vbar-thumb").getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const t0 = await page.evaluate(() => document.querySelector(".mbm-stage").style.transform);
await page.mouse.move(tb.x, tb.y);
await page.mouse.down();
await page.mouse.move(tb.x, tb.y + 160, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(250);
const t1 = await page.evaluate(() => document.querySelector(".mbm-stage").style.transform);
console.log("drag:", t0, "->", t1);
await page.screenshot({ path: path.join(here, "shots", "92-vbar.png") });

// 跳转面板：显式聚焦输入框
await page.evaluate(() => window.mbm.view.openJump());
await page.waitForTimeout(300);
await page.click(".mbm-jump-input");
await page.keyboard.type("加粗");
await page.waitForTimeout(300);
console.log("input value:", await page.evaluate(() => document.querySelector(".mbm-jump-input").value));
console.log("filtered:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".mbm-jump-title")].map(e => e.textContent))));
await page.screenshot({ path: path.join(here, "shots", "93-jump.png") });
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
console.log("selected:", await page.evaluate(() => window.mbm.view.canvas.getSelected()?.title ?? null));
await browser.close();
