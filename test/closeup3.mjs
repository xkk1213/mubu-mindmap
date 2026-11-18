import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 3 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);

const pick = async (name) => {
  const el = await page.evaluateHandle(() => {
    const n = [...document.querySelectorAll(".mbm-node")].find((x) => x.textContent.includes("纯文本笔记"));
    return n || null;
  });
  return el.asElement();
};

let el = await pick();
if (el) await el.screenshot({ path: path.join(here, "shots", "74-node-on.png") });

// 含 1、2 层 strong 的标题节点（产品规划 Q4 根 / 目标与背景）
const root = await page.evaluateHandle(() => document.querySelector('.mbm-node--root'));
await root.asElement()?.screenshot({ path: path.join(here, "shots", "75-root-on.png") });

await page.evaluate(() => window.mbm.toggleEmphasis());
await page.waitForTimeout(400);
el = await pick();
if (el) await el.screenshot({ path: path.join(here, "shots", "74-node-off.png") });
const r2 = await page.evaluateHandle(() => document.querySelector('.mbm-node--root'));
await r2.asElement()?.screenshot({ path: path.join(here, "shots", "75-root-off.png") });
console.log("done");
await browser.close();
