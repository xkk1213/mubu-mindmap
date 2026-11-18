import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(here, "shots", "52-overview.png") });
// 重叠检查
const ov = await page.evaluate(() => {
  const c = window.mbm.view.canvas;
  const ns = c.layout.nodes;
  const bad = [];
  for (let i = 0; i < ns.length; i++)
    for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i], b = ns[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
        bad.push([a.node.title.slice(0, 10), b.node.title.slice(0, 10)]);
    }
  return bad;
});
console.log("overlaps:", JSON.stringify(ov));
console.log("edges:", await page.evaluate(() => {
  const paths = Array.from(document.querySelectorAll(".mbm-edge")).filter((p) => (p.getAttribute("d") || "").length > 5);
  return { drawn: paths.length, nodes: document.querySelectorAll(".mbm-node").length };
}));
// 表格浮层
await page.evaluate(() => window.mbm.openTableOf("风险清单"));
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(here, "shots", "53-table-lb3.png") });
await browser.close();
