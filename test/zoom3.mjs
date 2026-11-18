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
  const node = Array.from(document.querySelectorAll(".mbm-node")).find((n) => n.querySelector(".mbm-block img"));
  const body = node.querySelector(".mbm-body");
  const blocks = Array.from(body.children).map((b) => {
    const cs = getComputedStyle(b);
    return { cls: b.className, display: cs.display, w: b.offsetWidth, h: b.offsetHeight, x: b.offsetLeft, y: b.offsetTop };
  });
  const csBody = getComputedStyle(body);
  const csNode = getComputedStyle(node);
  return { blocks, body: { display: csBody.display, w: body.offsetWidth, h: body.offsetHeight }, node: { display: csNode.display, w: node.offsetWidth, h: node.offsetHeight, width: csNode.width } };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
