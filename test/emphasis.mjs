import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1.4 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text()); });
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);

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

const dumpStyles = () =>
  page.evaluate(() => {
    const out = [];
    for (let d = 0; d <= 4; d++) {
      const node = document.querySelector(`.mbm-node[data-depth="${d}"]`);
      if (!node) { out.push({ d, missing: true }); continue; }
      const title = node.querySelector(".mbm-title");
      const strong = node.querySelector(".mbm-title-text strong");
      const rec = { d, base: title ? getComputedStyle(title).fontWeight : "-" };
      if (strong) {
        const cs = getComputedStyle(strong);
        rec.strong = cs.fontWeight;
        rec.bg = cs.backgroundColor;
        rec.deco = cs.textDecorationLine;
        rec.decoColor = cs.textDecorationColor;
        rec.color = cs.color;
      }
      out.push(rec);
    }
    return out;
  });

// 1) 用一份带粗体标题的小文档检查 1~4 层强调
await page.evaluate((text) => window.mbm.__setRoot(window.mbm.__parse(text, "probe").root), probeDoc);
await page.waitForTimeout(700);
console.log("probe on:", JSON.stringify(await dumpStyles()));
await page.screenshot({ path: path.join(here, "shots", "60-emphasis.png") });

await page.evaluate(() => window.mbm.toggleEmphasis());
await page.waitForTimeout(300);
console.log("probe off:", JSON.stringify(await dumpStyles()));
await page.screenshot({ path: path.join(here, "shots", "61-emphasis-off.png") });
await page.evaluate(() => window.mbm.toggleEmphasis());
await page.waitForTimeout(250);

// 2) 回到原文档，打开卡片放大
await page.reload();
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);
await page.evaluate(() => window.mbm.openCardZoomBtnOf("核心功能"));
await page.waitForTimeout(700);
console.log("card viewer:", JSON.stringify(await page.evaluate(() => window.mbm.cardViewerInfo())));
await page.screenshot({ path: path.join(here, "shots", "62-card-viewer.png") });

// 3) 方向键切换
for (const key of ["ArrowRight", "ArrowRight", "ArrowDown", "ArrowLeft"]) {
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
}
console.log("after nav:", JSON.stringify(await page.evaluate(() => window.mbm.cardViewerInfo())));
await page.screenshot({ path: path.join(here, "shots", "63-card-nav.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(350);

// 4) 含表格的卡片：卡片内表格再放大一层
await page.evaluate(() => window.mbm.openCardOf("风险清单"));
await page.waitForTimeout(700);
console.log("table card:", JSON.stringify(await page.evaluate(() => window.mbm.cardViewerInfo())));
await page.screenshot({ path: path.join(here, "shots", "64-card-table.png") });

const clicked = await page.evaluate(() => {
  const lb = document.querySelector(".mbm-lb");
  const cell = lb.querySelector(".mbm-block--table td");
  if (!cell) return false;
  cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return true;
});
await page.waitForTimeout(650);
console.log("nested click:", clicked, JSON.stringify(await page.evaluate(() => window.mbm.cardViewerInfo())));
await page.screenshot({ path: path.join(here, "shots", "65-card-nested-table.png") });

// 5) Esc 先关表格，再关卡片
await page.keyboard.press("Escape");
await page.waitForTimeout(320);
console.log("after esc1:", JSON.stringify(await page.evaluate(() => window.mbm.cardViewerInfo())));
await page.keyboard.press("Escape");
await page.waitForTimeout(420);
console.log("after esc2:", JSON.stringify(await page.evaluate(() => window.mbm.cardViewerInfo())));

// 6) 深色主题
await page.evaluate(() => window.mbm.theme("dark"));
await page.waitForTimeout(400);
await page.evaluate(() => window.mbm.openCardOf("核心功能"));
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(here, "shots", "66-card-dark.png") });
console.log("dark viewer:", JSON.stringify(await page.evaluate(() => window.mbm.cardViewerInfo())));
await browser.close();
