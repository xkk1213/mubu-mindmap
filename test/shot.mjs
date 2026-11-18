import { chromium } from "playwright-core";
import path from "path";
import fs from "fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const shots = path.join(here, "shots");
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1.4 });
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console error]", m.text());
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);

const shot = async (name) => {
  await page.screenshot({ path: path.join(shots, name + ".png") });
  console.log("saved", name);
};

await shot("01-mindmap-light");

// 检查渲染情况
const info = await page.evaluate(() => {
  const nodes = document.querySelectorAll(".mbm-node");
  const edges = document.querySelectorAll(".mbm-edge");
  const zero = Array.from(nodes).filter((n) => n.offsetWidth < 5 || n.offsetHeight < 5).length;
  return {
    nodes: nodes.length,
    edges: edges.length,
    zeroSize: zero,
    canvas: (() => {
      const c = document.querySelector(".mbm-canvas");
      return c ? [c.clientWidth, c.clientHeight] : null;
    })(),
    pathsWithD: Array.from(edges).filter((p) => (p.getAttribute("d") || "").length > 5).length,
  };
});
console.log("render info:", info);

// 折叠
await page.evaluate(() => window.mbm.collapseAll());
await page.waitForTimeout(450);
await shot("02-collapsed");

// 展开 + 切换布局
await page.evaluate(() => window.mbm.expandAll());
await page.waitForTimeout(450);
await page.evaluate(() => window.mbm.fit());
await page.waitForTimeout(200);
await page.evaluate(() => window.mbm.setMode("right"));
await page.waitForTimeout(500);
await shot("03-layout-right");

await page.evaluate(() => window.mbm.setMode("down"));
await page.waitForTimeout(500);
await page.evaluate(() => window.mbm.fit());
await page.waitForTimeout(300);
await shot("04-layout-down");

// 深色
await page.evaluate(() => {
  document.body.classList.remove("theme-light");
  document.body.classList.add("theme-dark");
  window.mbm.theme("dark");
  window.mbm.setMode("mindmap");
});
await page.waitForTimeout(600);
await page.evaluate(() => window.mbm.fit());
await page.waitForTimeout(350);
await shot("05-mindmap-dark");

// 样式面板
await page.evaluate(() => window.mbm.openPanel());
await page.waitForTimeout(300);
await shot("06-style-panel");

// 高亮联动
await page.evaluate(() => window.mbm.highlight(12));
await page.waitForTimeout(500);
await shot("07-highlight");

const final = await page.evaluate(() => ({
  nodes: document.querySelectorAll(".mbm-node").length,
  edges: document.querySelectorAll(".mbm-edge").length,
  d: Array.from(document.querySelectorAll(".mbm-edge")).map((p) => (p.getAttribute("d") || "").slice(0, 24)),
}));
console.log("final:", JSON.stringify(final, null, 1));

await browser.close();
