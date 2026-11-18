import { MindmapView } from "../src/view";
import { parseMarkdown } from "../src/parser";
import { DEFAULT_SETTINGS } from "../src/types";
import { App, WorkspaceLeaf } from "./obsidian-mock";

const IMG =
  "data:image/svg+xml;base64," +
  b64encode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f8cff"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><rect width="520" height="200" rx="12" fill="url(#g)"/><text x="40" y="95" font-family="Segoe UI" font-size="30" fill="#fff" font-weight="700">架构示意图</text><text x="40" y="135" font-family="Segoe UI" font-size="16" fill="#e0e7ff">Markdown → 思维导图</text></svg>`
  );

const SAMPLE = `---
title: 产品规划 Q4
---

## 目标与背景

- 让**纯文本笔记**直接变成**可读性极强的导图**
  现在团队大量文档都写在 Obsidian 里，但缺少结构化预览，
  每次汇报前都要手工重画一遍，非常浪费时间。

  | 指标 | 现状 | 目标 |
  | --- | --- | --- |
  | 汇报准备 | 2 小时 | 10 分钟 |
  | 内容完整度 | 60% | 100% |

- 核心原则：**内容全显示**，不做标题截断

## 核心功能

1. 一键转换
   - 标题、列表自动成树
   - 支持 1. 2. 3. 有序列表
   - 保留多行正文
2. 完美渲染
   - **加粗**、*斜体*、\`行内代码\`
   - 表格、图片、引用原样呈现
3. 双向联动
   - 点导图选中节点
   - 需要时再跳到原文

> 设计原则：阅读优先，节点内也要能舒服地读长文。

![架构图](${IMG})

## 交互细节

- 布局切换：左右 / 右向 / 左向 / 向下
- 缩放与适应画布，滚轮丝滑
- 展开 / 折叠、锁定、撤销、一键还原
- 样式设置：字号、间距、连线、配色

### 排期

- [x] 解析器与布局引擎
- [x] 画布渲染与联动
- [ ] 导出 PNG / SVG
- [ ] 移动端手势优化

### 风险清单

| 风险项 | 影响面 | 概率 | 应对策略 | 负责人 |
| --- | --- | --- | --- | --- |
| 需求频繁变更 | 返工 | 中 | 双周对齐 | 产品 |
| 编辑器性能瓶颈 | 卡顿 | 低 | 增量渲染 | 前端 |
| 表格过长撑高卡片 | 阅读 | 高 | 限高滚动 | 前端 |
| 图片体积过大 | 加载慢 | 中 | 压缩后入库 | 设计 |
| 分支连线错位 | 观感 | 低 | 布局重算 | 前端 |
| 移动端手势冲突 | 体验 | 中 | 单独适配 | 前端 |
| 导出格式不统一 | 交付 | 中 | 统一模板 | 设计 |
| 多人协作冲突 | 版本 | 高 | 分支策略 | 全员 |
| 键盘快捷键冲突 | 操作 | 低 | 可配置 | 前端 |
| 主题对比度不足 | 可读 | 中 | 双主题校验 | 设计 |
| 折叠状态丢失 | 连续 | 中 | 按行号记忆 | 前端 |
| 大文档首屏慢 | 体验 | 中 | 懒渲染 | 前端 |

\`\`\`ts
const tree = parseMarkdown(note);
const layout = computeLayout(tree, sizes, { mode: "mindmap" });
\`\`\`
`;

/* Obsidian 对 HTMLElement 的扩展方法，仅预览使用 */
function polyfillDom() {
  const proto = Element.prototype as any;
  proto.empty = function () {
    while (this.firstChild) this.removeChild(this.firstChild);
    return this;
  };
  proto.createEl = function (tag: string, o: any = {}) {
    if (typeof o === "string") o = { cls: o };
    const el = document.createElement(tag);
    if (o.cls) el.className = o.cls;
    if (o.text) el.textContent = o.text;
    if (o.attr) for (const k of Object.keys(o.attr)) el.setAttribute(k, o.attr[k]);
    this.appendChild(el);
    return el;
  };
  proto.createDiv = function (o?: any) {
    return this.createEl("div", o);
  };
  proto.createSpan = function (o?: any) {
    return this.createEl("span", o);
  };
  proto.setText = function (t: string) {
    this.textContent = t;
    return this;
  };
  proto.addClass = function (...c: string[]) {
    this.classList.add(...c);
    return this;
  };
  proto.removeClass = function (...c: string[]) {
    this.classList.remove(...c);
    return this;
  };
  proto.toggleClass = function (c: string, v?: boolean) {
    this.classList.toggle(c, v);
    return this;
  };
  proto.setAttr = function (k: string, v: string) {
    this.setAttribute(k, v);
    return this;
  };
}

polyfillDom();

function b64encode(s: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(s, "utf8").toString("base64");
  return btoa(unescape(encodeURIComponent(s)));
}

async function main() {
  const settings = { ...DEFAULT_SETTINGS };
  const plugin: any = {
    settings,
    saveSettings: async () => {},
    views: new Set(),
  };

  const app = new App() as any;
  app.vault = {
    read: async () => SAMPLE,
    modify: async () => {},
    process: async () => {},
    on: () => ({}),
    getAbstractFileByPath: () => null,
  };
  app.workspace = {
    on: () => ({}),
    getLeavesOfType: () => [],
    getLeaf: () => null,
    setActiveLeaf: () => {},
    trigger: () => {},
    revealLeaf: () => {},
  };

  const leaf: any = new WorkspaceLeaf();
  const view: any = new MindmapView(leaf, plugin);
  plugin.toggleEmphasis = async () => {
    settings.emphasis = settings.emphasis === false;
    view.onSettingsChanged();
  };
  app.workspace.activeLeaf = leaf;
  (view as any).app = app;
  document.getElementById("root")!.appendChild(view.containerEl);

  await view.onOpen();
  await view.setFile({
    path: "产品规划 Q4.md",
    basename: "产品规划 Q4",
    extension: "md",
  });

  const findByTitle = (title: string): any => {
    const root = (view.canvas as any)?.root;
    let found: any = null;
    const walk = (n: any) => {
      if (found) return;
      if ((n.title || "").includes(title)) found = n;
      n.children.forEach(walk);
    };
    if (root) walk(root);
    return found;
  };

  const pointer = (x: number, y: number, extra: any = {}) =>
    ({
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      ...extra,
    } as any);

  (window as any).mbm = {
    view,
    settings,
    findByTitle,
    setMode: (m: string) => {
      settings.layout = m as any;
      view.canvas?.setMode(m, true);
    },
    zoom: (k: number) => view.canvas?.zoomTo(k, false),
    fit: () => view.canvas?.fit(false),
    collapseAll: () => view.canvas?.setAllCollapsed(true, 1),
    expandAll: () => view.canvas?.setAllCollapsed(false),
    highlight: (line: number) => view.canvas?.focusLine(line, { scroll: true, flash: false }),
    style: (patch: any) => {
      Object.assign(settings, patch);
      view.canvas?.refreshStyle();
    },
    openPanel: () => {
      const p = document.querySelector(".mbm-style-panel");
      p?.classList.add("is-open");
    },
    theme: (t: string) => {
      settings.theme = t;
      view.canvas?.applyStyleVars();
    },
    toggleLock: () => view.toggleLock(),
    isLocked: () => view.locked,
    indent: (title: string) => view.applyStructure("indent", findByTitle(title)),
    outdent: (title: string) => view.applyStructure("outdent", findByTitle(title)),
    moveUp: (title: string) => view.applyStructure("up", findByTitle(title)),
    moveDown: (title: string) => view.applyStructure("down", findByTitle(title)),
    moveTo: (title: string, targetTitle: string) =>
      view.reparent(findByTitle(title), findByTitle(targetTitle)),
    resetNode: (title: string) => view.resetNodeToSource(findByTitle(title)),
    clearAdjust: () => view.clearViewAdjust(),
    adjust: () => JSON.parse(JSON.stringify(view.adjust)),
    toggleNode: (title: string) => view.toggleNode(findByTitle(title)),
    dragNode: async (title: string, dx: number, dy: number, alt = false) => {
      const node = findByTitle(title);
      if (!node) return { ok: false };
      const el = document.querySelector(
        `.mbm-node[data-id="${node.id}"]`
      ) as HTMLElement | null;
      if (!el) return { ok: false };
      const r = el.getBoundingClientRect();
      const sx = r.left + Math.min(60, r.width / 2);
      const sy = r.top + 14;
      el.dispatchEvent(new PointerEvent("pointerdown", pointer(sx, sy, { altKey: alt })));
      window.dispatchEvent(
        new PointerEvent("pointermove", pointer(sx + dx * 0.4, sy + dy * 0.4, { altKey: alt }))
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", pointer(sx + dx, sy + dy, { altKey: alt }))
      );
      window.dispatchEvent(new PointerEvent("pointerup", pointer(sx + dx, sy + dy, { altKey: alt })));
      await new Promise((res) => setTimeout(res, 260));
      return { ok: true };
    },
    hoverTip: (index: number) => {
      const btn = document.querySelectorAll<HTMLElement>(".mbm-toolbar .mbm-btn")[index];
      if (!btn) return false;
      btn.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false }));
      return true;
    },
    toolbar: () =>
      Array.from(document.querySelectorAll(".mbm-toolbar .mbm-btn")).map((b) => ({
        svg: !!b.querySelector("svg"),
        label: (b.textContent || "").trim(),
        w: (b as HTMLElement).offsetWidth,
      })),
    openTableOf: (title: string) => {
      const node = findByTitle(title);
      if (!node) return false;
      const el = document.querySelector(`.mbm-node[data-id="${node.id}"]`);
      const btn = el?.querySelector(".mbm-zoom-btn") as HTMLElement | null;
      if (!btn) return false;
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    },
    openCardOf: (title: string) => {
      const node = findByTitle(title);
      if (!node) return false;
      view.canvas?.openCardViewer(node);
      return true;
    },
    openCardZoomBtnOf: (title: string) => {
      const node = findByTitle(title);
      if (!node) return false;
      const el = document.querySelector(`.mbm-node[data-id="${node.id}"]`);
      const btn = el?.querySelector(".mbm-card-zoom") as HTMLElement | null;
      if (!btn) return false;
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    },
    toggleEmphasis: () => view.toggleEmphasis(),
    emphasis: () => settings.emphasis,
    strongStyle: () => {
      const probe = document.querySelector(
        '.mbm-node[data-depth="2"] .mbm-title-text strong, .mbm-node .mbm-title-text strong'
      ) as HTMLElement | null;
      if (!probe) return null;
      const cs = getComputedStyle(probe);
      return {
        weight: cs.fontWeight,
        bg: cs.backgroundColor,
        color: cs.color,
        decoration: cs.textDecorationLine,
      };
    },
    cardViewerInfo: () => {
      const lb = document.querySelector(".mbm-lb") as HTMLElement | null;
      if (!lb) return null;
      return {
        title: lb.querySelector(".mbm-lb-title")?.textContent ?? "",
        sub: lb.querySelector(".mbm-lb-sub")?.textContent ?? "",
        count: document.querySelectorAll(".mbm-lb").length,
        tables: lb.querySelectorAll(".mbm-block--table").length,
        imgs: lb.querySelectorAll("img").length,
        zoom: lb.querySelector(".mbm-lb-zoom")?.textContent ?? "",
      };
    },
    openImageOf: () => {
      const img = document.querySelector(".mbm-node img") as HTMLImageElement | null;
      if (!img) return false;
      img.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    },
    resizeNode: async (title: string, dw: number, dh: number) => {
      const node = findByTitle(title);
      if (!node) return false;
      const el = document.querySelector(`.mbm-node[data-id="${node.id}"]`) as HTMLElement;
      if (!el) return false;
      const sizeBefore = { w: el.offsetWidth, h: el.offsetHeight };
      const grip = el.querySelector(".mbm-resize") as HTMLElement;
      const r = el.getBoundingClientRect();
      const sx = r.right - 4;
      const sy = r.bottom - 4;
      grip.dispatchEvent(new PointerEvent("pointerdown", pointer(sx, sy)));
      window.dispatchEvent(new PointerEvent("pointermove", pointer(sx + dw * 0.5, sy + dh * 0.5)));
      window.dispatchEvent(new PointerEvent("pointermove", pointer(sx + dw, sy + dh)));
      window.dispatchEvent(new PointerEvent("pointerup", pointer(sx + dw, sy + dh)));
      await new Promise((res) => setTimeout(res, 320));
      return {
        before: sizeBefore,
        after: { w: el.offsetWidth, h: el.offsetHeight },
      };
    },
    setTableMode: (mode: string) => {
      settings.tableMode = mode as any;
      view.canvas?.applyStyleVars();
      view.canvas?.refreshStyle();
    },
    setStrong: (mode: string) => {
      settings.strongStyle = mode as any;
      view.canvas?.applyStyleVars();
      view.canvas?.refreshStyle();
    },
    tableInfo: () => {
      const wrap = document.querySelector(".mbm-block--table") as HTMLElement | null;
      if (!wrap) return null;
      return {
        clientH: wrap.clientHeight,
        scrollH: wrap.scrollHeight,
        overflow: wrap.scrollHeight > wrap.clientHeight + 2,
      };
    },
    __parse: (text: string, name: string) =>
      parseMarkdown(text, name, { softBreak: settings.softBreak }),
    __setRoot: (root: any) => view.canvas.setRoot(root, { fit: true }),
  };

  (window as any).mbm.perf = async () => {
    const lines: string[] = ["# 大文档测试"];
    for (let i = 0; i < 60; i++) {
      lines.push("", "## 章节 " + i);
      for (let j = 0; j < 5; j++) {
        lines.push("- 条目 " + i + "." + j + " 这是一段比较长的说明文字用来测试换行与测量性能");
        lines.push("  续行内容 " + j);
        for (let k = 0; k < 2; k++) {
          lines.push("  - 子条目 " + i + "." + j + "." + k);
        }
      }
    }
    const text = lines.join("\n");
    const t0 = performance.now();
    const parsed = window.mbm.__parse(text, "perf");
    const t1 = performance.now();
    await window.mbm.__setRoot(parsed.root);
    const t2 = performance.now();
    const nodes = document.querySelectorAll(".mbm-node").length;
    const edges = Array.from(document.querySelectorAll(".mbm-edge")).filter((p) => (p.getAttribute("d") || "").length > 5).length;
    return { parseMs: Math.round(t1 - t0), renderMs: Math.round(t2 - t1), nodes, edgesWithD: edges };
  };
  document.body.classList.add("ready");
}

void main();
