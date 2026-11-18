import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);
await page.evaluate(() => window.mbm.toggleLock());
await page.waitForTimeout(200);

// 表格节点特写：hover 显示放大按钮
const tblBox = await page.evaluate(() => {
  const outer = Array.from(document.querySelectorAll(".mbm-table-outer")).sort((a,b) => b.offsetHeight - a.offsetHeight)[0];
  const node = outer.closest(".mbm-node");
  const r = node.getBoundingClientRect();
  const tr = outer.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, tx: tr.x, ty: tr.y, tw: tr.width };
});
await page.mouse.move(tblBox.tx + tblBox.tw / 2, tblBox.ty + 30);
await page.waitForTimeout(400);
const btnState = await page.evaluate(() => {
  const b = document.querySelector(".mbm-zoom-btn");
  return { opacity: getComputedStyle(b).opacity, hasSvg: !!b.querySelector("svg"), w: b.offsetWidth };
});
console.log("zoomBtn:", JSON.stringify(btnState));
await page.screenshot({ path: path.join(here, "shots", "50-table-hover.png"),
  clip: { x: Math.max(0, tblBox.x - 20), y: Math.max(0, tblBox.y - 20), width: Math.min(560, tblBox.w + 60), height: Math.min(560, tblBox.h + 60) } });

// 选中节点显示缩放手柄
await page.evaluate(() => {
  const n = window.mbm.findByTitle("核心功能");
  window.mbm.view.canvas.setActive(n.id, {});
});
await page.waitForTimeout(300);
const grip = await page.evaluate(() => {
  const el = document.querySelector(".mbm-node.is-active .mbm-resize");
  if (!el) return null;
  return { opacity: getComputedStyle(el).opacity, w: el.offsetWidth, h: el.offsetHeight };
});
console.log("grip:", JSON.stringify(grip));

// 表格浮层（新字号）
await page.evaluate(() => window.mbm.openTableOf("风险清单"));
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(here, "shots", "51-table-lb2.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// 完整展开模式
await page.evaluate(() => window.mbm.setTableMode("full"));
await page.waitForTimeout(700);
const fullInfo = await page.evaluate(() => {
  const holder = Array.from(document.querySelectorAll(".mbm-block--table")).sort((a,b) => b.scrollHeight - a.scrollHeight)[0];
  return { h: holder.clientHeight, scrollH: holder.scrollHeight, cardH: holder.closest(".mbm-node").offsetHeight };
});
console.log("fullMode:", JSON.stringify(fullInfo));
await page.evaluate(() => window.mbm.setTableMode("limit"));
await page.waitForTimeout(400);

await browser.close();
