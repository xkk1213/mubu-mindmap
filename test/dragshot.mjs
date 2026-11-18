import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1.6 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);
await page.evaluate(() => {
  window.mbm.toggleLock();
  window.mbm.zoom(0.72);
});
await page.waitForTimeout(400);

// 1) 拖到一半：展示拖动阴影 + 连线跟随
await page.evaluate(async () => {
  const node = window.mbm.findByTitle("排期");
  const el = document.querySelector(`.mbm-node[data-id="${node.id}"]`);
  const r = el.getBoundingClientRect();
  const sx = r.left + 40, sy = r.top + 16;
  const p = (x, y, extra = {}) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", ...extra });
  el.dispatchEvent(new PointerEvent("pointerdown", p(sx, sy)));
  window.dispatchEvent(new PointerEvent("pointermove", p(sx + 60, sy + 90)));
  window.dispatchEvent(new PointerEvent("pointermove", p(sx + 130, sy + 200)));
});
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(here, "shots", "20-dragging.png") });
await page.evaluate(() => {
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 500, clientY: 500, button: 0, pointerId: 1 }));
});
await page.waitForTimeout(400);

// 2) Alt 拖拽到目标：展示 drop 高亮
await page.evaluate(async () => {
  const node = window.mbm.findByTitle("风险清单");
  const target = window.mbm.findByTitle("核心功能");
  const el = document.querySelector(`.mbm-node[data-id="${node.id}"]`);
  const tel = document.querySelector(`.mbm-node[data-id="${target.id}"]`);
  const r = el.getBoundingClientRect();
  const tr = tel.getBoundingClientRect();
  const sx = r.left + 40, sy = r.top + 16;
  const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
  const p = (x, y, extra = {}) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 2, pointerType: "mouse", altKey: true, ...extra });
  el.dispatchEvent(new PointerEvent("pointerdown", p(sx, sy, { altKey: true })));
  window.dispatchEvent(new PointerEvent("pointermove", p(sx + 20, sy - 20, { altKey: true })));
  window.dispatchEvent(new PointerEvent("pointermove", p(tx, ty, { altKey: true })));
  window.__dropPoint = [tx, ty];
});
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(here, "shots", "21-drop-target.png") });
await page.evaluate(() => {
  const [x, y] = window.__dropPoint;
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 2, pointerType: "mouse", altKey: true }));
});
await page.waitForTimeout(600);
await page.evaluate(() => window.mbm.fit());
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(here, "shots", "22-after-reparent.png") });
console.log("adjust:", JSON.stringify(await page.evaluate(() => window.mbm.adjust())));
await browser.close();
