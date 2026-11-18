import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);
// 工具栏特写 + 提示
await page.evaluate(() => window.mbm.hoverTip(2));
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(here, "shots", "30-toolbar.png"), clip: { x: 640, y: 0, width: 640, height: 110 } });
// 样式面板
await page.evaluate(() => window.mbm.openPanel());
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(here, "shots", "31-panel.png") });
// 节点特写（根节点与一个正文节点）
await page.evaluate(() => { window.mbm.zoom(1); window.mbm.view.canvas.centerOnNode(window.mbm.findByTitle("核心功能")); });
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(here, "shots", "32-node-detail.png") });
await browser.close();
