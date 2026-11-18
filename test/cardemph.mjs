import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(800);

const openCard = async () => {
  await page.evaluate(() => {
    const n = [...document.querySelectorAll(".mbm-node")].find((x) => x.querySelector("strong"));
    n.querySelector(".mbm-card-zoom").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(600);
};
const probe = () =>
  page.evaluate(() => {
    const lb = document.querySelector(".mbm-lb");
    if (!lb) return { closed: true };
    const s = lb.querySelector("strong");
    const cs = s ? getComputedStyle(s) : null;
    return {
      cls: lb.className,
      bg: cs?.backgroundColor,
      stroke: cs?.webkitTextStrokeWidth,
      color: cs?.color,
      weight: cs?.fontWeight,
    };
  });

await openCard();
console.log("card ON :", JSON.stringify(await probe()));
await page.screenshot({ path: path.join(here, "shots", "77-card-on.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

await page.evaluate(() => window.mbm.toggleEmphasis());
await page.waitForTimeout(300);
await openCard();
console.log("card OFF:", JSON.stringify(await probe()));
await page.screenshot({ path: path.join(here, "shots", "78-card-off.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.evaluate(() => window.mbm.toggleEmphasis());
await page.waitForTimeout(300);

// 深色主题
await page.evaluate(() => {
  window.mbm.settings.theme = "dark";
  window.mbm.view.canvas.applyStyleVars();
});
await page.waitForTimeout(500);
console.log("dark:", JSON.stringify(await page.evaluate(() => {
  const n = [...document.querySelectorAll(".mbm-node")].find((x) => x.querySelector("strong"));
  const s = n.querySelector("strong");
  const cs = getComputedStyle(s);
  return { depth: n.dataset.depth, bg: cs.backgroundColor, color: cs.color, stroke: cs.webkitTextStrokeWidth };
})));
await page.evaluate(() => {
  const n = [...document.querySelectorAll(".mbm-node")].find((x) => x.querySelector("strong"));
  n.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(here, "shots", "79-dark-emph.png") });
console.log("errors:", errs);
await browser.close();
