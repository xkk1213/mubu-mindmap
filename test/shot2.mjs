import { chromium } from "playwright-core";
import path from "path";
import fs from "fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const shots = path.join(here, "shots");
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1.4 });
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console error]", m.text());
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);

const shot = async (name, clip) => {
  await page.screenshot({ path: path.join(shots, name + ".png"), clip });
  console.log("saved", name);
};

// 1. 默认状态：锁定 + 纯图标工具栏
await shot("10-default-locked");
console.log("locked:", await page.evaluate(() => window.mbm.isLocked()));
console.log("toolbar:", JSON.stringify(await page.evaluate(() => window.mbm.toolbar())));
console.log("table:", JSON.stringify(await page.evaluate(() => window.mbm.tableInfo())));

// 2. 悬浮提示
await page.evaluate(() => window.mbm.hoverTip(3));
await page.waitForTimeout(420);
await shot("11-tooltip", { x: 0, y: 0, width: 1500, height: 200 });
console.log("tip:", await page.evaluate(() => {
  const t = document.querySelector(".mbm-tip");
  return t ? { text: t.textContent, visible: t.classList.contains("is-visible") } : null;
}));

// 3. 解锁后拖动卡片
await page.evaluate(() => window.mbm.toggleLock());
await page.waitForTimeout(200);
const dragRes = await page.evaluate(async () => {
  const node = window.mbm.findByTitle("交互细节");
  const before = node ? { x: 0 } : null;
  const r = await window.mbm.dragNode("交互细节", 120, 180);
  return { r, before, adjust: window.mbm.adjust() };
});
console.log("drag:", JSON.stringify(dragRes).slice(0, 300));
await page.waitForTimeout(400);
await shot("12-dragged");

// 4. 缩进一级（不改 md）
const indentRes = await page.evaluate(async () => {
  await window.mbm.indent("排期");
  await new Promise((r) => setTimeout(r, 400));
  return window.mbm.adjust();
});
console.log("indent:", JSON.stringify(indentRes).slice(0, 300));
await page.evaluate(() => window.mbm.fit());
await page.waitForTimeout(400);
await shot("13-indented");

// 5. 撤销
await page.evaluate(async () => {
  const btn = document.querySelectorAll(".mbm-toolbar .mbm-btn");
  btn[5]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(500);

// 6. 深色
await page.evaluate(() => {
  document.body.classList.remove("theme-light");
  document.body.classList.add("theme-dark");
  window.mbm.theme("dark");
  window.mbm.fit();
});
await page.waitForTimeout(600);
await shot("14-dark");

// 7. 表格限高特写
const tbl = await page.evaluate(() => {
  const wrap = document.querySelector(".mbm-block--table");
  if (!wrap) return null;
  const node = wrap.closest(".mbm-node");
  node.scrollIntoView({ block: "center" });
  const r = node.getBoundingClientRect();
  return { x: Math.max(0, r.left - 20), y: Math.max(0, r.top - 20), w: r.width + 40, h: Math.min(600, r.height + 40) };
});
if (tbl) {
  await page.waitForTimeout(300);
  await shot("15-table", { x: tbl.x, y: tbl.y, width: tbl.w, height: tbl.h });
}

const final = await page.evaluate(() => ({
  nodes: document.querySelectorAll(".mbm-node").length,
  edges: document.querySelectorAll(".mbm-edge").length,
  pathsWithD: Array.from(document.querySelectorAll(".mbm-edge")).filter(
    (p) => (p.getAttribute("d") || "").length > 5
  ).length,
}));
console.log("final:", JSON.stringify(final));

await browser.close();
