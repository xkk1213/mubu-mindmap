import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 });
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(800);
const info = await page.evaluate(() => {
  const img = document.querySelector(".mbm-block img");
  if (!img) return { found: false };
  const r = img.getBoundingClientRect();
  return {
    found: true,
    natural: [img.naturalWidth, img.naturalHeight],
    rect: [Math.round(r.width), Math.round(r.height)],
    complete: img.complete,
    srcHead: img.getAttribute("src")?.slice(0, 80),
    display: getComputedStyle(img).display,
  };
});
console.log(JSON.stringify(info, null, 1));
const node = await page.evaluateHandle(() => {
  const nodes = Array.from(document.querySelectorAll(".mbm-node"));
  return nodes.find((n) => n.querySelector(".mbm-block img"));
});
await page.evaluate((n) => { n.scrollIntoView(); }, node);
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(here, "shots", "zoom-img.png") });
await browser.close();
