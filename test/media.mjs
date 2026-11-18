import { chromium } from "playwright-core";
import path from "path";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.6 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text()); });

await page.goto("file:///" + path.join(here, "preview.html").replace(/\\/g, "/"));
await page.waitForFunction(() => document.body.classList.contains("ready"), null, { timeout: 15000 });
await page.waitForTimeout(900);

// 1) 节点内表格：放大按钮 / 溢出提示
const tbl = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll(".mbm-table-outer").forEach((o) => {
    const holder = o.querySelector(".mbm-block--table");
    out.push({
      hasBtn: !!o.querySelector(".mbm-zoom-btn"),
      hasMore: !!o.querySelector(".mbm-table-more"),
      moreText: o.querySelector(".mbm-table-more")?.textContent ?? null,
      overflow: holder.scrollHeight > holder.clientHeight + 2,
      h: holder.clientHeight,
    });
  });
  return out;
});
console.log("tables:", JSON.stringify(tbl));

await page.screenshot({ path: path.join(here, "shots", "40-strong.png") });

// 2) 表格放大
const opened = await page.evaluate(() => window.mbm.openTableOf("风险清单"));
await page.waitForTimeout(700);
const lbInfo = await page.evaluate(() => {
  const lb = document.querySelector(".mbm-lb");
  if (!lb) return null;
  const stage = lb.querySelector(".mbm-lb-stage");
  return {
    exists: true,
    title: lb.querySelector(".mbm-lb-title")?.textContent,
    sub: lb.querySelector(".mbm-lb-sub")?.textContent,
    zoom: lb.querySelector(".mbm-lb-zoom")?.textContent,
    rows: lb.querySelectorAll("tbody tr").length,
    cols: lb.querySelectorAll("thead th").length,
    stageW: Math.round(stage.getBoundingClientRect().width),
    stageH: Math.round(stage.getBoundingClientRect().height),
  };
});
console.log("opened:", opened, JSON.stringify(lbInfo));
await page.screenshot({ path: path.join(here, "shots", "41-table-lightbox.png") });

// 适应窗口
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll(".mbm-lb-btn"));
  btns.find((b) => b.textContent === "适应")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(500);
console.log("fit:", await page.evaluate(() => document.querySelector(".mbm-lb-zoom")?.textContent));
await page.screenshot({ path: path.join(here, "shots", "42-table-fit.png") });

await page.keyboard.press("Escape");
await page.waitForTimeout(400);
console.log("closed:", await page.evaluate(() => !document.querySelector(".mbm-lb")));

// 3) 图片放大
const imgOpened = await page.evaluate(() => window.mbm.openImageOf());
await page.waitForTimeout(700);
console.log("image:", imgOpened, await page.evaluate(() => {
  const lb = document.querySelector(".mbm-lb");
  return lb ? { title: lb.querySelector(".mbm-lb-title")?.textContent, sub: lb.querySelector(".mbm-lb-sub")?.textContent } : null;
}));
await page.screenshot({ path: path.join(here, "shots", "43-image-lightbox.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// 4) 卡片手动尺寸
await page.evaluate(() => window.mbm.toggleLock());
await page.waitForTimeout(200);
const res = await page.evaluate(() => window.mbm.resizeNode("核心功能", 120, 90));
console.log("resizeResult:", JSON.stringify(res));
const after = await page.evaluate(() => {
  const el = document.querySelector(".mbm-node--custom-size") || document.querySelector(".mbm-node--heading");
  const grip = el.querySelector(".mbm-resize");
  return {
    w: el.offsetWidth,
    h: el.offsetHeight,
    cls: el.className,
    gripOpacity: getComputedStyle(grip).opacity,
    styleW: el.style.width,
    styleH: el.style.height,
  };
});
console.log("resize:", JSON.stringify(after));
console.log("adjust:", JSON.stringify(await page.evaluate(() => window.mbm.adjust())));

await page.evaluate(() => window.mbm.fit());
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(here, "shots", "44-resized.png") });

// 5) 三种粗体样式对比
for (const mode of ["mark", "color", "bold"]) {
  await page.evaluate((m) => window.mbm.setStrong(m), mode);
  await page.waitForTimeout(350);
  const node = await page.evaluate(() => {
    const n = Array.from(document.querySelectorAll(".mbm-node")).find((x) => x.querySelector("strong"));
    if (!n) return null;
    const st = n.querySelector("strong");
    const cs = getComputedStyle(st);
    return { cls: n.className.slice(0, 40), bg: cs.backgroundColor, color: cs.color, weight: cs.fontWeight };
  });
  console.log("strong", mode, JSON.stringify(node));
}
await page.evaluate(() => window.mbm.setStrong("mark"));
await page.waitForTimeout(300);

// 放大一段正文看粗体效果
await page.evaluate(() => {
  window.mbm.zoom(1);
  const n = Array.from(document.querySelectorAll(".mbm-node")).find((x) => x.querySelector(".mbm-node-body strong"));
  if (n) window.mbm.view.canvas.centerOnNode(window.mbm.findByTitle((n.querySelector(".mbm-title")?.textContent || "").trim()));
});
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(here, "shots", "45-strong-zoom.png") });

await browser.close();
