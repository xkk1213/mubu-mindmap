import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);
const info = await page.evaluate(() => {
  const c = window.mbm.view.canvas;
  const out = [];
  const walk = (n, d, side) => {
    out.push({ d, side, t: (n.node.title || "").slice(0, 10), x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h) });
    n.children.forEach((k) => walk(k, d + 1, k.side));
  };
  walk(c.layout.root, 0, 1);
  return out;
});
console.table(info);
// 是否存在重叠
const overlap = await page.evaluate(() => {
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
console.log("overlaps:", JSON.stringify(overlap));
await browser.close();
