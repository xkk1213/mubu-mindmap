import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(800);
console.log(JSON.stringify(await page.evaluate(() => {
  const all = [...document.querySelectorAll("strong, b, em, mark")];
  return {
    total: all.length,
    sample: all.slice(0, 6).map((s) => ({
      tag: s.tagName,
      text: s.textContent.trim().slice(0, 12),
      chain: (() => { const out = []; let p = s.parentElement; for (let i = 0; i < 4 && p; i++) { out.push(p.className || p.tagName); p = p.parentElement; } return out; })(),
      bg: getComputedStyle(s).backgroundColor,
    })),
    nodeWithBg: [...document.querySelectorAll(".mbm-node")].filter((n) => n.querySelector("strong, b")).length,
    bodySample: (() => {
      const n = [...document.querySelectorAll(".mbm-node")].find((x) => x.textContent.includes("纯文本笔记"));
      return n ? n.outerHTML.slice(0, 900) : null;
    })(),
  };
}), null, 1));
await browser.close();
