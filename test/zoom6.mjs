import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 });
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);
const info = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".mbm-block--table")).map((w) => ({
    clientH: w.clientHeight,
    scrollH: w.scrollHeight,
    clientW: w.clientWidth,
    scrollW: w.scrollWidth,
    rows: w.querySelectorAll("tbody tr").length,
    cols: w.querySelectorAll("thead th").length,
    cardH: w.closest(".mbm-node").offsetHeight,
  }));
});
console.log("tables:", JSON.stringify(info, null, 1));
// 聚焦大表格节点
await page.evaluate(() => window.mbm.zoom(1));
await page.waitForTimeout(300);
const box = await page.evaluate(() => {
  const wraps = Array.from(document.querySelectorAll(".mbm-block--table"));
  const big = wraps.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
  if (!big) return null;
  const node = big.closest(".mbm-node");
  window.mbm.view.canvas.centerOnNode(window.mbm.findByTitle("风险清单"));
  return true;
});
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(here, "shots", "16-table-zoom.png") });
const info2 = await page.evaluate(() => {
  const wraps = Array.from(document.querySelectorAll(".mbm-block--table"));
  const big = wraps.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
  const r = big.getBoundingClientRect();
  const th = big.querySelector("thead th");
  return { rect: [Math.round(r.width), Math.round(r.height)], sticky: th ? getComputedStyle(th).position : null };
});
console.log("big table:", JSON.stringify(info2));
await browser.close();
