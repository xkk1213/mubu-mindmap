import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);

const snap = () =>
  page.evaluate(() => {
    const nodes = [...document.querySelectorAll(".mbm-node")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.dataset.id,
        x: +r.left.toFixed(2),
        y: +r.top.toFixed(2),
        w: +r.width.toFixed(2),
        h: +r.height.toFixed(2),
      };
    });
    const inlines = [...document.querySelectorAll(".mbm-title-text strong, .mbm-title-text b, .mbm-node-body strong, .mbm-node-body b")].map(
      (el) => {
        const r = el.getBoundingClientRect();
        return { t: el.textContent, x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
      }
    );
    const canvas = document.querySelector(".mbm-canvas");
    const cr = canvas.getBoundingClientRect();
    return { nodes, inlines, canvas: { w: +cr.width.toFixed(2), h: +cr.height.toFixed(2) } };
  });

const diff = (a, b) => {
  let worst = 0;
  let where = "";
  for (let i = 0; i < a.nodes.length; i++) {
    const p = a.nodes[i];
    const q = b.nodes[i];
    if (!q || p.id !== q.id) return { broken: `node ${i} mismatch` };
    for (const k of ["x", "y", "w", "h"]) {
      const d = Math.abs(p[k] - q[k]);
      if (d > worst) { worst = d; where = `node ${p.id} ${k}: ${p[k]} -> ${q[k]}`; }
    }
  }
  for (let i = 0; i < a.inlines.length; i++) {
    const p = a.inlines[i];
    const q = b.inlines[i];
    if (!q) return { broken: `inline ${i} missing` };
    for (const k of ["x", "y", "w", "h"]) {
      const d = Math.abs(p[k] - q[k]);
      if (d > worst) { worst = d; where = `inline「${p.t}」${k}: ${p[k]} -> ${q[k]}`; }
    }
  }
  return { worst: +worst.toFixed(2), where };
};

const styleOf = (title) =>
  page.evaluate((t) => {
    const node = window.mbm.findByTitle(t);
    if (!node) return null;
    const el = document.querySelector(`.mbm-node[data-id="${node.id}"]`);
    const s = el?.querySelector(".mbm-title-text strong");
    if (!s) return { missing: true };
    const cs = getComputedStyle(s);
    const card = el.querySelector(".mbm-card");
    return {
      title: t,
      weight: cs.fontWeight,
      bg: cs.backgroundColor,
      color: cs.color,
      stroke: cs.webkitTextStrokeWidth + " " + cs.webkitTextStrokeColor,
      shadow: cs.boxShadow,
      deco: cs.textDecorationLine,
      cardW: +card.getBoundingClientRect().width.toFixed(2),
      cardH: +card.getBoundingClientRect().height.toFixed(2),
    };
  }, title);

const on = await snap();
console.log("ON  samples:", JSON.stringify([await styleOf("完美渲染"), await styleOf("核心功能"), await styleOf("产品规划 Q4")], null, 1));
await page.screenshot({ path: path.join(here, "shots", "70-emph-on.png") });

await page.evaluate(() => window.mbm.toggleEmphasis());
await page.waitForTimeout(500);
const off = await snap();
console.log("OFF samples:", JSON.stringify([await styleOf("完美渲染"), await styleOf("核心功能")], null, 1));
await page.screenshot({ path: path.join(here, "shots", "71-emph-off.png") });

console.log("position diff:", JSON.stringify(diff(on, off)));
console.log("nodes/inlines:", on.nodes.length, on.inlines.length);

await page.evaluate(() => window.mbm.toggleEmphasis());
await page.waitForTimeout(400);
const back = await snap();
console.log("toggle back diff:", JSON.stringify(diff(on, back)));
console.log("errors:", errs);
await browser.close();
