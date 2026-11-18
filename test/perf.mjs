import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(500);
for (const mode of ["mindmap", "right", "down"]) {
  const r = await page.evaluate(async (m) => {
    window.mbm.view.canvas.setMode(m, false);
    const t0 = performance.now();
    const res = await window.mbm.perf();
    const t1 = performance.now();
    return { ...res, layoutSwitchMs: Math.round(t1 - t0) };
  }, mode);
  console.log(mode, JSON.stringify(r));
}
await browser.close();
