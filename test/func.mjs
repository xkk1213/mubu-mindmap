import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(800);

const treeShape = () => page.evaluate(() => {
  const out = [];
  const walk = (n, d) => { out.push("  ".repeat(d) + (n.title || "").slice(0, 12)); n.children.forEach((c) => walk(c, d + 1)); };
  walk(window.mbm.view.root, 0);
  return out;
});

console.log("--- 初始 ---");
console.log((await treeShape()).join("\n"));

console.log("--- 移动：把「排期」挂到「核心功能」下 ---");
await page.evaluate(async () => { await window.mbm.moveTo("排期", "核心功能"); });
await page.waitForTimeout(500);
console.log((await treeShape()).join("\n"));
console.log("adjust:", JSON.stringify(await page.evaluate(() => window.mbm.adjust())));

console.log("--- 撤销 ---");
await page.evaluate(() => document.querySelectorAll(".mbm-toolbar .mbm-btn")[5].dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(500);
console.log((await treeShape()).join("\n"));

console.log("--- 重新移动后还原该节点 ---");
await page.evaluate(async () => { await window.mbm.moveTo("排期", "核心功能"); });
await page.waitForTimeout(400);
await page.evaluate(async () => { await window.mbm.resetNode("排期"); });
await page.waitForTimeout(500);
console.log((await treeShape()).join("\n"));
console.log("adjust after reset:", JSON.stringify(await page.evaluate(() => window.mbm.adjust())));

console.log("--- 键盘 Tab 缩进（解锁 + 选中） ---");
await page.evaluate(() => {
  window.mbm.toggleLock();
  const node = window.mbm.findByTitle("风险清单");
  window.mbm.view.canvas.setActive(node.id, {});
  const vp = document.querySelector(".mbm-viewport");
  vp.focus();
  vp.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
});
await page.waitForTimeout(500);
console.log((await treeShape()).join("\n"));

console.log("--- 锁定状态下 Tab 应被拒绝 ---");
await page.evaluate(() => window.mbm.toggleLock());
await page.evaluate(() => {
  const vp = document.querySelector(".mbm-viewport");
  vp.focus();
  vp.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
});
await page.waitForTimeout(400);
console.log((await treeShape()).join("\n"));

await browser.close();
