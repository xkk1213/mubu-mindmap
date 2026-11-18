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

const snap = () =>
  page.evaluate(() => ({
    nodes: [...document.querySelectorAll(".mbm-node")].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.id, x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
    }),
    inlines: [...document.querySelectorAll(".mbm-title-text strong, .mbm-node-body strong")].map((el) => {
      const r = el.getBoundingClientRect();
      return { t: el.textContent.slice(0, 8), x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
    }),
  }));

const styles = () =>
  page.evaluate(() => {
    const s = [...document.querySelectorAll(".mbm-node strong")][0];
    if (!s) return null;
    const cs = getComputedStyle(s);
    return {
      bg: cs.backgroundColor,
      stroke: cs.webkitTextStrokeWidth,
      deco: cs.textDecorationLine,
      weight: cs.fontWeight,
      color: cs.color,
    };
  });

const cmp = (a, b) => {
  let worst = 0, where = "";
  const keys = ["x", "y", "w", "h"];
  for (let i = 0; i < a.nodes.length; i++) {
    for (const k of keys) {
      const d = Math.abs(a.nodes[i][k] - b.nodes[i][k]);
      if (d > worst) { worst = d; where = `node#${i}.${k}`; }
    }
  }
  for (let i = 0; i < a.inlines.length; i++) {
    for (const k of keys) {
      const d = Math.abs(a.inlines[i][k] - b.inlines[i][k]);
      if (d > worst) { worst = d; where = `inline「${a.inlines[i].t}」.${k}`; }
    }
  }
  return { worst: +worst.toFixed(2), where, count: `${a.nodes.length}/${a.inlines.length}` };
};

for (const st of ["mark", "underline", "color", "bold"]) {
  await page.evaluate((v) => {
    window.mbm.settings.strongStyle = v;
    window.mbm.view.canvas.applyStyleVars();
  }, st);
  await page.waitForTimeout(350);
  const on = await snap();
  const so = await styles();
  await page.screenshot({ path: path.join(here, "shots", `80-style-${st}.png`) });
  await page.evaluate(() => window.mbm.toggleEmphasis());
  await page.waitForTimeout(350);
  const off = await snap();
  const sf = await styles();
  console.log(st, "| on:", JSON.stringify(so), "| off:", JSON.stringify(sf), "| diff:", JSON.stringify(cmp(on, off)));
  await page.evaluate(() => window.mbm.toggleEmphasis());
  await page.waitForTimeout(250);
}
console.log("errors:", errs);
await browser.close();
