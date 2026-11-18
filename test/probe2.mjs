import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2.5 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(800);

const doc = [
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

await page.evaluate((t) => window.mbm.__setRoot(window.mbm.__parse(t, "probe").root), doc);
await page.waitForTimeout(800);

const dump = () =>
  page.evaluate(() => {
    const out = [];
    for (const node of document.querySelectorAll(".mbm-node")) {
      const s = node.querySelector("strong");
      if (!s) continue;
      const cs = getComputedStyle(s);
      const nr = node.getBoundingClientRect();
      const sr = s.getBoundingClientRect();
      out.push({
        depth: node.dataset.depth,
        text: s.textContent,
        weight: cs.fontWeight,
        bg: cs.backgroundColor,
        color: cs.color,
        stroke: cs.webkitTextStrokeWidth,
        nodeW: +nr.width.toFixed(1),
        nodeH: +nr.height.toFixed(1),
        inlineW: +sr.width.toFixed(1),
        inlineX: +sr.left.toFixed(1),
      });
    }
    return out;
  });

console.log("ON :", JSON.stringify(await dump(), null, 0));
const shots = await page.evaluate(() =>
  [...document.querySelectorAll(".mbm-node")].map((n) => ({ d: n.dataset.depth, t: n.textContent.slice(0, 10) }))
);
// 逐个层级截图
for (const d of [0, 1, 2, 3]) {
  const h = await page.evaluateHandle((depth) => {
    const list = [...document.querySelectorAll(`.mbm-node[data-depth="${depth}"]`)];
    return list.find((n) => n.querySelector("strong")) || null;
  }, d);
  const el = h.asElement();
  if (el) await el.screenshot({ path: path.join(here, "shots", `76-depth${d}-on.png`) });
}
await page.evaluate(() => window.mbm.toggleEmphasis());
await page.waitForTimeout(400);
console.log("OFF:", JSON.stringify(await dump(), null, 0));
for (const d of [0, 1, 2, 3]) {
  const h = await page.evaluateHandle((depth) => {
    const list = [...document.querySelectorAll(`.mbm-node[data-depth="${depth}"]`)];
    return list.find((n) => n.querySelector("strong")) || null;
  }, d);
  const el = h.asElement();
  if (el) await el.screenshot({ path: path.join(here, "shots", `76-depth${d}-off.png`) });
}
await browser.close();
