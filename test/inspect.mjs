import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1.4 });
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(800);
const big = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll(".mbm-node"));
  return nodes.map((n) => ({
    title: (n.querySelector(".mbm-title")?.textContent || "").slice(0, 18),
    w: n.offsetWidth,
    h: n.offsetHeight,
    blocks: Array.from(n.querySelectorAll(".mbm-block")).map((b) => ({
      kind: b.className.replace("mbm-block ", ""),
      w: b.offsetWidth,
      h: b.offsetHeight,
      htmlHead: b.innerHTML.slice(0, 120),
    })),
  })).sort((a, b) => b.h - a.h).slice(0, 4);
});
console.log(JSON.stringify(big, null, 1));
await browser.close();
