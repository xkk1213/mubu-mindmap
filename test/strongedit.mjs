import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);

const snap = () => page.evaluate(() => ({
  nodes: [...document.querySelectorAll(".mbm-node")].map(el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(v => +v.toFixed(2)); }),
  spans: [...document.querySelectorAll("[data-mk]")].map(el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(v => +v.toFixed(2)); }),
}));
const cmp = (a, b) => {
  let worst = 0;
  const walk = (x, y) => x.forEach((r, i) => r.forEach((v, k) => { worst = Math.max(worst, Math.abs(v - y[i][k])); }));
  walk(a.nodes, b.nodes); walk(a.spans, b.spans);
  return +worst.toFixed(2);
};

const a0 = await snap();
// 只改第一个加粗片段
const info = await page.evaluate(() => {
  const el = document.querySelector("[data-mk]");
  const key = el.dataset.mk;
  const p = window.mbm.view.file.path;
  window.mbm.settings.strongOverrides[p] = { [key]: "underline" };
  window.mbm.view.canvas.repaintAllStrong();
  return { key, text: el.textContent, path: p };
});
await page.waitForTimeout(300);
const a1 = await snap();
console.log("override:", JSON.stringify(info));
console.log("style of span1:", JSON.stringify(await page.evaluate(() => {
  const els = [...document.querySelectorAll("[data-mk]")];
  return els.slice(0, 3).map(el => { const cs = getComputedStyle(el); return { t: el.textContent.slice(0, 8), bg: cs.backgroundColor, deco: cs.textDecorationLine }; });
})));
console.log("layout diff after override:", cmp(a0, a1));

// 再测总开关仍稳定
await page.evaluate(() => window.mbm.toggleEmphasis());
await page.waitForTimeout(400);
const a2 = await snap();
console.log("layout diff emphasis off:", cmp(a0, a2));
console.log("span1 after off:", await page.evaluate(() => { const cs = getComputedStyle(document.querySelector("[data-mk]")); return cs.backgroundColor + " / " + cs.textDecorationLine; }));
await page.evaluate(() => window.mbm.toggleEmphasis());
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(here, "shots", "94-strong-edit.png") });
console.log("errors:", errs);
await browser.close();
