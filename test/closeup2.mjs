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

const probe = (title, tag) =>
  page.evaluate(([t, g]) => {
    const node = window.mbm.findByTitle(t);
    if (!node) return { missing: t };
    const el = document.querySelector(`.mbm-node[data-id="${node.id}"]`);
    const list = [...el.querySelectorAll("strong, b")].map((s) => {
      const cs = getComputedStyle(s);
      const r = s.getBoundingClientRect();
      return {
        text: s.textContent.trim().slice(0, 14),
        weight: cs.fontWeight,
        bg: cs.backgroundColor,
        color: cs.color,
        stroke: cs.webkitTextStrokeWidth,
        w: +r.width.toFixed(1),
        h: +r.height.toFixed(1),
      };
    });
    return { title: t, tag: g, count: list.length, list: list.slice(0, 4) };
  }, [title, tag]);

console.log(JSON.stringify(await probe("目标与背景", "heading"), null, 1));
console.log(JSON.stringify(await probe("完美渲染", "list"), null, 1));
console.log(JSON.stringify(await probe("产品规划 Q4", "root"), null, 1));

// 聚焦“目标与背景”分支，放大截图
await page.evaluate(() => {
  const n = window.mbm.findByTitle("目标与背景");
  window.mbm.view.canvas.setActive(n.id, { scroll: true, flash: false });
  window.mbm.zoom(1.7);
});
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(here, "shots", "72-emph-close.png") });

// 放大卡片视图里的强调
await page.evaluate(() => window.mbm.openCardOf("目标与背景"));
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(here, "shots", "73-card-emph.png") });
console.log("card viewer emphasis:", JSON.stringify(await page.evaluate(() => {
  const lb = document.querySelector(".mbm-lb");
  const s = lb?.querySelector("strong");
  if (!s) return { missing: true, cls: lb?.className };
  const cs = getComputedStyle(s);
  return { cls: lb.className, bg: cs.backgroundColor, stroke: cs.webkitTextStrokeWidth, weight: cs.fontWeight };
}), null, 1));
await browser.close();
