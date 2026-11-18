import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);
// 缩放到 1.2 并聚焦到“完美渲染”分支
await page.evaluate(() => {
  const node = window.mbm.findByTitle("完美渲染");
  window.mbm.view.canvas.setActive(node.id, { scroll: true, flash: false });
  window.mbm.zoom(1.4);
});
await page.waitForTimeout(600);
const el = await page.evaluate((t) => {
  const node = window.mbm.findByTitle(t);
  return node ? `.mbm-node[data-id="${node.id}"]` : null;
}, "完美渲染");
if (el) await page.hover(el);
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(here, "shots", "67-closeup.png") });

// 工具栏 hover 提示
await page.evaluate(() => window.mbm.hoverTip(3));
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(here, "shots", "68-toolbar-tip.png"), clip: { x: 800, y: 0, width: 780, height: 120 } });
console.log("tip:", await page.evaluate(() => document.querySelector(".mbm-tip")?.textContent ?? null));
await browser.close();
