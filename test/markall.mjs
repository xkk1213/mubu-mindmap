import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(800);
const doc = ["# **中心**主题", "", "## **一级**标题", "", "- 条目 **重点** 内容"].join("\n");
await page.evaluate((t) => window.mbm.__setRoot(window.mbm.__parse(t, "p").root), doc);
await page.waitForTimeout(600);
for (const st of ["mark", "markall"]) {
  await page.evaluate((v) => { window.mbm.settings.strongStyle = v; window.mbm.view.canvas.applyStyleVars(); }, st);
  await page.waitForTimeout(300);
  console.log(st, JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".mbm-node")].filter(n => n.querySelector("strong")).map(n => {
    const cs = getComputedStyle(n.querySelector("strong"));
    return { d: n.dataset.depth, bg: cs.backgroundColor, deco: cs.textDecorationLine };
  }))));
}
// 位置仍然稳定
const s1 = await page.evaluate(() => [...document.querySelectorAll(".mbm-node")].map(n => n.getBoundingClientRect().toJSON()));
await page.evaluate(() => window.mbm.toggleEmphasis());
await page.waitForTimeout(300);
const s2 = await page.evaluate(() => [...document.querySelectorAll(".mbm-node")].map(n => n.getBoundingClientRect().toJSON()));
const worst = Math.max(...s1.map((r, i) => Math.max(Math.abs(r.x - s2[i].x), Math.abs(r.y - s2[i].y), Math.abs(r.width - s2[i].width))));
console.log("worst diff markall:", worst.toFixed(2));
await browser.close();
