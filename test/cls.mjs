import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);
console.log(await page.evaluate(() => {
  const root = document.querySelector(".mbm-node--root");
  const card = root.querySelector(".mbm-card");
  const cs = getComputedStyle(card);
  return { cls: root.className, border: cs.border, outline: cs.outline, boxShadow: cs.boxShadow.slice(0, 90), active: root.classList.contains("is-active") };
}));
await browser.close();
