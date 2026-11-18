import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1.6 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);

// 1) 分层的下划线 / 荧光笔
const probeDoc = [
  "# **中心**主题",
  "",
  "## **一级**标题",
  "",
  "- 普通条目里 **重点** 内容",
  "  - 三级列表 **强调** 项",
  "",
  "### **三级**小标题",
  "",
  "- 四级列表 **粗体** 内容",
].join("\n");
await page.evaluate((t) => window.mbm.__setRoot(window.mbm.__parse(t, "probe").root), probeDoc);
await page.waitForTimeout(800);
console.log("layers:", JSON.stringify(await page.evaluate(() => {
  return [...document.querySelectorAll(".mbm-node")].filter(n => n.querySelector("strong")).map(n => {
    const s = n.querySelector("strong"); const cs = getComputedStyle(s);
    return { d: n.dataset.depth, t: s.textContent, bg: cs.backgroundColor, deco: cs.textDecorationLine, dc: cs.textDecorationColor, w: cs.fontWeight };
  });
}), null, 0));
await page.evaluate(() => window.mbm.view.canvas.fit(true));
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(here, "shots", "90-layers.png") });

// 2) 滚动条
const bar = await page.evaluate(() => {
  const b = document.querySelector(".mbm-vbar");
  const t = document.querySelector(".mbm-vbar-thumb");
  if (!b || !t) return null;
  const br = b.getBoundingClientRect(), tr = t.getBoundingClientRect();
  return { hidden: b.classList.contains("is-hidden"), barH: +br.height.toFixed(0), thumbH: +tr.height.toFixed(0), top: +tr.top.toFixed(0) };
});
console.log("vbar:", JSON.stringify(bar));

// 3) 键盘平移
const before = await page.evaluate(() => document.querySelector(".mbm-stage").style.transform);
await page.click(".mbm-viewport", { position: { x: 400, y: 700 } });
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(200);
const after = await page.evaluate(() => document.querySelector(".mbm-stage").style.transform);
console.log("pan:", before, "->", after);

// 4) 跳转面板
await page.evaluate(() => window.mbm.view.openJump());
await page.waitForTimeout(400);
const jump = await page.evaluate(() => {
  const m = document.querySelector(".mbm-jump-modal");
  const rows = [...document.querySelectorAll(".mbm-jump-row")].length;
  return { open: !!m, rows, input: !!document.querySelector(".mbm-jump-input") };
});
console.log("jump:", JSON.stringify(jump));
await page.keyboard.type("三级");
await page.waitForTimeout(300);
const filtered = await page.evaluate(() => [...document.querySelectorAll(".mbm-jump-row .mbm-jump-title")].map(e => e.textContent));
console.log("filtered:", JSON.stringify(filtered));
await page.screenshot({ path: path.join(here, "shots", "91-jump.png") });
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
console.log("selected after jump:", await page.evaluate(() => window.mbm.view.canvas.getSelected()?.title ?? null));
console.log("errors:", errs);
await browser.close();
