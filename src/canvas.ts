/**
 * 画布：负责渲染、测量、布局、连线、缩放平移、折叠、行内编辑、正文渲染。
 *
 * 设计要点：
 * - 节点用 HTML 绝对定位（能完美渲染表格 / 图片 / 内链 / 公式）；
 * - 连线用独立 SVG 图层，每次布局完成后统一重绘，从不依赖异步状态，因此不会“无故消失”；
 * - 一切坐标以内容坐标系为准，缩放只作用于外层 transform；
 * - 支持「卡片自由拖动」：偏移量叠加在自动布局之上，父节点移动时整棵子树跟随；
 * - 支持「按住 Alt 拖动改层级」：只改导图视图，不动 Markdown。
 */

import { App, Component, MarkdownRenderer, Notice, setIcon } from "obsidian";
import { keyOf } from "./adjust";
import { computeLayout, LayoutResult, PlacedNode, Size } from "./layout";
import { NavDir, MediaViewer, openCard, openImage, openTable } from "./media";
import { findNodeForLine } from "./parser";
import { LayoutMode, MindNode, MubuSettings } from "./types";

export interface CanvasCallbacks {
  onSelect: (node: MindNode) => void;
  onToggle: (node: MindNode) => void;
  onEdit: (node: MindNode, text: string) => void;
  onMenu: (node: MindNode, ev: MouseEvent) => void;
  onStructure: (op: "indent" | "outdent" | "up" | "down", node: MindNode) => void;
  onReparent: (node: MindNode, target: MindNode) => void;
  onOffsetsChange: (
    offsets: Record<string, { dx: number; dy: number }>,
    node: MindNode,
    prev: { dx: number; dy: number }
  ) => void;
  onResize: (
    node: MindNode,
    size: { w: number; h: number } | null,
    phase: "start" | "move" | "end"
  ) => void;
  onToggleLock?: () => void;
  /** 右键某个加粗片段：单独设置它的强调方式 */
  onStrongMenu?: (node: MindNode, el: HTMLElement, key: string, ev: MouseEvent) => void;
  onStats?: (count: number) => void;
  onZoom?: (k: number) => void;
}

/** 单字强调方式：荧光笔 / 下划线 / 强调色 / 仅加粗 / 不强调 */
export type StrongStyle = "mark" | "underline" | "color" | "bold" | "none";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Entry {
  el: HTMLElement;
  node: MindNode;
}

interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const BRANCH_COLORS = [
  "#e8590c",
  "#1c7ed6",
  "#2f9e44",
  "#9c36b5",
  "#c2255c",
  "#0c8599",
  "#a9751b",
  "#5f3dc4",
];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 指针捕获在个别环境（合成事件 / 已释放）会抛错，安全包一层 */
function capture(el: Element | null, pointerId: number) {
  try {
    el?.setPointerCapture?.(pointerId);
  } catch {
    /* ignore */
  }
}
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function unwrapParagraphs(root: HTMLElement) {
  root.querySelectorAll("p").forEach((p) => {
    if (p.parentElement !== root) return;
    while (p.firstChild) root.insertBefore(p.firstChild, p);
    p.remove();
  });
}

/** 把标题里的 markdown 标记剥掉，给浮层标题栏用 */
function plainTitle(md: string): string {
  const text = (md || "")
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => b || a)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || "（空）";
}

export class MindmapCanvas {
  readonly wrapper: HTMLElement;
  private gridEl: HTMLElement;
  private viewport: HTMLElement;
  private stage: HTMLElement;
  private svg: SVGSVGElement;
  private layer: HTMLElement;

  private app: App;
  private component: Component;
  private getSettings: () => MubuSettings;
  private cb: CanvasCallbacks;
  private sourcePath: string;

  root: MindNode | null = null;
  private layout: LayoutResult | null = null;
  private els = new Map<string, Entry>();
  private paths = new Map<string, SVGPathElement>();
  private pos = new Map<string, Rect>();
  private bounds: Bounds = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private view = { x: 0, y: 0, k: 1 };
  private activeId: string | null = null;
  private locked = false;
  private mode: LayoutMode = "mindmap";
  private fitted = false;
  private raf = 0;
  private panState: { x: number; y: number; vx: number; vy: number } | null = null;
  private nodeDrag: {
    node: MindNode;
    key: string;
    sx: number;
    sy: number;
    dx: number;
    dy: number;
    moved: boolean;
    mode: "move" | "reparent";
    base: Map<string, Rect>;
    subtree: Set<string>;
    targetEl: HTMLElement | null;
  } | null = null;
  private editing = false;
  private styleTimer = 0;
  private suppressClick = false;
  private destroyed = false;
  private cardViewer: MediaViewer | null = null;

  /** 手工位置偏移：key -> 相对自动布局的位移 */
  private offsets = new Map<string, { dx: number; dy: number }>();
  /** 手工卡片尺寸：key -> 固定宽高 */
  private sizes = new Map<string, { w?: number; h?: number }>();
  private resizeRaf = 0;
  private resizeState: {
    node: MindNode;
    key: string;
    el: HTMLElement;
    sx: number;
    sy: number;
    w0: number;
    h0: number;
    w: number;
    h: number;
    moved: boolean;
  } | null = null;
  /** 视觉标记：做过层级调整 / 位置调整的节点 */
  private structureKeys = new Set<string>();
  private positionKeys = new Set<string>();
  private sizeKeys = new Set<string>();

  private lockBadge: HTMLElement;
  private vbar: HTMLElement | null = null;
  private vbarThumb: HTMLElement | null = null;
  private vbarDrag: { y: number; vy: number; range: number; trackH: number } | null = null;

  constructor(
    parent: HTMLElement,
    app: App,
    component: Component,
    sourcePath: string,
    getSettings: () => MubuSettings,
    cb: CanvasCallbacks
  ) {
    this.app = app;
    this.component = component;
    this.getSettings = getSettings;
    this.cb = cb;
    this.sourcePath = sourcePath;
    this.mode = getSettings().layout;

    this.wrapper = parent.createDiv("mbm-canvas");
    this.gridEl = this.wrapper.createDiv("mbm-grid");
    this.viewport = this.wrapper.createDiv("mbm-viewport");
    this.stage = this.viewport.createDiv("mbm-stage");
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.classList.add("mbm-edges");
    this.stage.appendChild(this.svg);
    this.layer = this.stage.createDiv("mbm-nodes");

    this.lockBadge = this.wrapper.createDiv("mbm-lock-badge");
    this.lockBadge.setAttribute("role", "button");
    this.lockBadge.addEventListener("click", () => this.cb.onToggleLock?.());

    // 右侧竖向滚动条：触控板 / 鼠标都能拖，点轨道直接翻页
    this.vbar = this.wrapper.createDiv("mbm-vbar");
    this.vbarThumb = this.vbar.createDiv("mbm-vbar-thumb");
    this.bindVBar();

    this.viewport.setAttribute("tabindex", "0");
    this.applyStyleVars();
    this.bindEvents();
  }

  /* ------------------------------------------------------------------ */
  /* 样式                                                                */
  /* ------------------------------------------------------------------ */

  applyStyleVars() {
    const s = this.getSettings();
    const st = this.wrapper.style;
    st.setProperty("--mbm-font", `${s.fontSize}px`);
    st.setProperty("--mbm-body-font", `${s.bodyFontSize}px`);
    st.setProperty("--mbm-maxw", `${s.nodeMaxWidth}px`);
    st.setProperty("--mbm-line-w", `${s.lineWidth}`);
    st.setProperty("--mbm-table-maxh", `${s.tableMaxHeight}px`);
    this.wrapper.classList.toggle("mbm-no-branch-color", !s.branchColors);
    this.wrapper.classList.toggle("mbm-table-full", s.tableMode === "full");

    // 主题变量挂在容器上，工具栏与画布共用
    const host =
      (this.wrapper.closest(".mbm-container") as HTMLElement | null) ??
      this.wrapper;

    // 强调相关类同时挂到容器上：放大浮层从容器复制类名，否则浮层里强调会丢。
    // 关闭「内容突出」时直接不挂强调类 —— 少一层 !important 覆盖，也保证字重/宽度不变。
    for (const el of [this.wrapper, host]) {
      el.classList.remove(
        "mbm-strong-mark",
        "mbm-strong-markall",
        "mbm-strong-color",
        "mbm-strong-bold",
        "mbm-strong-underline"
      );
      if (s.emphasis !== false) {
        el.classList.add(`mbm-strong-${s.strongStyle ?? "mark"}`);
      }
      el.classList.toggle("mbm-emphasis-off", s.emphasis === false);
    }

    this.wrapper.classList.toggle("mbm-locked", this.locked);
    const dark =
      s.theme === "dark" ||
      (s.theme === "auto" && document.body.classList.contains("theme-dark"));
    host.classList.toggle("mbm-theme-dark", dark);
    host.classList.toggle("mbm-theme-light", !dark);

    // 总开关变化后，单字自定义也要重画（关掉时一并撤掉）
    this.annotateAllStrong();
  }

  async refreshStyle() {
    this.applyStyleVars();
    if (this.styleTimer) window.clearTimeout(this.styleTimer);
    this.styleTimer = window.setTimeout(() => {
      this.styleTimer = 0;
      void this.relayout(false);
    }, 60);
  }

  setLocked(locked: boolean) {
    this.locked = locked;
    this.wrapper.classList.toggle("mbm-locked", locked);
    this.lockBadge.empty();
    if (locked) {
      const ic = this.lockBadge.createSpan("mbm-lock-badge-ic");
      setIcon(ic, "lock");
      this.lockBadge.createSpan({ text: "已锁定 · 点击解锁" });
      this.lockBadge.addClass("is-visible");
    } else {
      this.lockBadge.removeClass("is-visible");
    }
  }

  isLocked() {
    return this.locked;
  }

  setMode(mode: LayoutMode, animate = true) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.relayout(animate);
  }

  getMode() {
    return this.mode;
  }

  /* ------------------------------------------------------------------ */
  /* 数据                                                                */
  /* ------------------------------------------------------------------ */

  async setRoot(root: MindNode, opts: { fit?: boolean; animate?: boolean } = {}) {
    this.root = root;
    this.clear();
    this.pos.clear();
    this.fitted = false;
    await this.render();
    this.relayout(false);
    if (opts.fit !== false) this.fit(false);
    this.reportStats();
  }

  /** 手工位置偏移（来自视图层的调整记录） */
  setOffsets(offsets: Record<string, { dx: number; dy: number }>) {
    this.offsets.clear();
    for (const [k, v] of Object.entries(offsets)) {
      if (!v) continue;
      if (!v.dx && !v.dy) continue;
      this.offsets.set(k, { dx: v.dx, dy: v.dy });
    }
    void this.relayout(false);
  }

  /** 手工卡片尺寸（来自视图层的调整记录） */
  setSizes(sizes: Record<string, { w?: number; h?: number }>) {
    this.sizes.clear();
    for (const [k, v] of Object.entries(sizes)) {
      if (v && (v.w || v.h)) this.sizes.set(k, { w: v.w, h: v.h });
    }
    this.applySizes();
    void this.relayout(false);
  }

  /** 把手工尺寸写到 DOM（未设置的保持自然尺寸） */
  private applySizes() {
    for (const entry of this.els.values()) {
      const key = keyOf(entry.node);
      const sz = this.sizes.get(key);
      entry.el.style.width = sz?.w ? `${Math.round(sz.w)}px` : "";
      entry.el.style.height = sz?.h ? `${Math.round(sz.h)}px` : "";
      entry.el.classList.toggle("mbm-node--sized", !!sz);
    }
  }

  /** 标记哪些节点被手动调整过，用于视觉提示 */
  setAdjustMarks(
    structure: Iterable<string>,
    position: Iterable<string>,
    sized: Iterable<string> = []
  ) {
    this.structureKeys = new Set(structure);
    this.positionKeys = new Set(position);
    this.sizeKeys = new Set(sized);
    for (const [id, entry] of this.els) {
      this.applyAdjustMark(entry.el, entry.node);
    }
  }

  private applyAdjustMark(el: HTMLElement, node: MindNode) {
    const k = keyOf(node);
    el.classList.toggle("mbm-node--moved", this.structureKeys.has(k));
    el.classList.toggle("mbm-node--pinned", this.positionKeys.has(k));
    el.classList.toggle("mbm-node--custom-size", this.sizeKeys.has(k));
  }

  /** 只改变折叠状态，复用已渲染 DOM，速度极快 */
  async setCollapsed(id: string, collapsed: boolean, animate = true) {
    const node = this.root ? this.findNode(this.root, id) : null;
    if (!node) return;
    node.collapsed = collapsed;
    await this.render(); // 复用缓存，只挂载/卸载 DOM
    this.relayout(animate);
  }

  async setAllCollapsed(collapsed: boolean, keepDepth = 1) {
    if (!this.root) return;
    const walk = (n: MindNode) => {
      if (n.children.length) {
        n.collapsed = collapsed && n.depth >= keepDepth;
      }
      n.children.forEach(walk);
    };
    walk(this.root);
    await this.render();
    this.relayout(true);
  }

  /** 当前是否有处于折叠状态的节点 */
  hasCollapsed(): boolean {
    let hit = false;
    const walk = (n: MindNode) => {
      if (hit) return;
      if (n.collapsed && n.children.length) hit = true;
      else n.children.forEach(walk);
    };
    if (this.root) walk(this.root);
    return hit;
  }

  /** 找到用于“定位”的节点，并展开其所有祖先 */
  async focusLine(line: number, opts: { scroll?: boolean; flash?: boolean } = {}) {
    if (!this.root) return null;
    const hit = findNodeForLine(this.root, line);
    if (!hit) return null;
    let changed = false;
    for (const anc of hit.path) {
      if (anc !== hit.node && anc.collapsed) {
        anc.collapsed = false;
        changed = true;
      }
    }
    if (changed) {
      await this.render();
      this.relayout(true);
    }
    this.setActive(hit.node.id, {
      scroll: opts.scroll !== false,
      flash: opts.flash !== false,
    });
    return hit.node;
  }

  setActive(id: string | null, opts: { scroll?: boolean; flash?: boolean } = {}) {
    if (this.activeId) {
      this.els.get(this.activeId)?.el.classList.remove("is-active", "is-flash");
    }
    this.activeId = id;
    if (!id) return;
    const entry = this.els.get(id);
    if (!entry) return;
    entry.el.classList.add("is-active");
    if (opts.flash !== false) {
      entry.el.classList.add("is-flash");
      window.setTimeout(() => entry.el.classList.remove("is-flash"), 1100);
    }
    if (opts.scroll) this.scrollToNode(id);
  }

  getSelected(): MindNode | null {
    if (!this.activeId || !this.root) return null;
    return this.findNode(this.root, this.activeId);
  }

  clearSelection() {
    this.setActive(null);
  }

  /** 展开祖先并选中：跳转面板用 */
  revealAndSelect(id: string) {
    if (!this.root) return;
    const trail: MindNode[] = [];
    const find = (n: MindNode, path: MindNode[]): boolean => {
      if (n.id === id) {
        trail.push(...path);
        return true;
      }
      return n.children.some((c) => find(c, [...path, n]));
    };
    find(this.root, []);
    let changed = false;
    for (const n of trail) {
      if (n.collapsed) {
        n.collapsed = false;
        changed = true;
      }
    }
    if (changed) void this.relayout(false);
    this.setActive(id, { scroll: true, flash: true });
  }

  scrollToNode(id: string) {
    const r = this.pos.get(id);
    if (!r) return;
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    const k = this.view.k;
    this.setView(
      {
        x: vw / 2 - (r.x + r.w / 2) * k,
        y: vh / 2 - (r.y + r.h / 2) * k,
        k,
      },
      true
    );
  }

  findNode(node: MindNode, id: string): MindNode | null {
    if (node.id === id) return node;
    for (const c of node.children) {
      const found = this.findNode(c, id);
      if (found) return found;
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* 渲染                                                                */
  /* ------------------------------------------------------------------ */

  private collectVisible(): MindNode[] {
    const out: MindNode[] = [];
    const walk = (n: MindNode) => {
      out.push(n);
      if (!n.collapsed) n.children.forEach(walk);
    };
    if (this.root) walk(this.root);
    return out;
  }

  private clear() {
    this.els.clear();
    this.paths.clear();
    this.layer.empty();
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
  }

  /** 重建/复用节点 DOM，返回需要等待的 markdown 渲染任务 */
  private async render() {
    if (!this.root) return;
    const visible = this.collectVisible();
    const visibleIds = new Set(visible.map((n) => n.id));
    const fresh = new Set<string>();

    for (const [id, entry] of Array.from(this.els.entries())) {
      if (!visibleIds.has(id)) entry.el.remove();
    }

    const jobs: Promise<void>[] = [];
    for (const node of visible) {
      let entry = this.els.get(node.id);
      if (!entry) {
        const el = this.buildNode(node, jobs);
        entry = { el, node };
        this.els.set(node.id, entry);
        fresh.add(node.id);
      }
      entry.node = node;
      if (!entry.el.parentElement) {
        this.layer.appendChild(entry.el);
        if (fresh.has(node.id)) {
          const el = entry.el;
          el.classList.add("mbm-enter");
          window.setTimeout(() => el.classList.remove("mbm-enter"), 320);
        }
      }
      entry.el.dataset.depth = String(node.depth);
      entry.el.classList.toggle("is-collapsed", node.collapsed);
      this.applyAdjustMark(entry.el, node);
      this.updateToggle(entry);
    }

    await Promise.all(jobs);
    this.annotateAllStrong();
    this.attachMediaListeners();
    this.reportStats();
  }

  private updateToggle(entry: Entry) {
    const node = entry.node;
    const toggle = entry.el.querySelector<HTMLElement>(".mbm-toggle");
    if (!toggle) return;
    const hasChildren = node.children.length > 0;
    toggle.toggleClass("is-hidden", !hasChildren);
    if (!hasChildren) return;
    toggle.setText(node.collapsed ? `+${this.countDescendants(node)}` : "−");
    toggle.setAttribute(
      "aria-label",
      node.collapsed ? "展开子节点" : "折叠子节点"
    );
  }

  private countDescendants(node: MindNode): number {
    let n = 0;
    const walk = (x: MindNode) => {
      for (const c of x.children) {
        n++;
        walk(c);
      }
    };
    walk(node);
    return n;
  }

  private countAll(node: MindNode): number {
    let n = 1;
    for (const c of node.children) n += this.countAll(c);
    return n;
  }

  private reportStats() {
    if (this.root) this.cb.onStats?.(this.countAll(this.root));
  }

  private buildNode(node: MindNode, jobs: Promise<void>[]): HTMLElement {
    const s = this.getSettings();
    const el = document.createElement("div");
    el.className = "mbm-node";
    el.dataset.id = node.id;
    if (node.kind === "root") el.classList.add("mbm-node--root");
    if (node.kind === "heading") el.classList.add("mbm-node--heading");
    if (node.kind === "item") el.classList.add("mbm-node--item");
    // 含表格的卡片默认放宽，避免多列表格被压成竖条
    if (node.blocks.some((b) => b.kind === "table")) {
      el.classList.add("mbm-node--wide");
    }
    el.dataset.depth = String(node.depth);

    const card = el.createDiv("mbm-card");
    const title = card.createDiv("mbm-title");

    if (s.showMarkers && node.marker) {
      if (node.checked !== null) {
        title.createSpan({ cls: "mbm-marker mbm-marker--task", text: node.checked ? "☑" : "☐" });
      } else {
        title.createSpan({
          cls:
            "mbm-marker" +
            (node.marker === "•" ? " mbm-marker--dot" : " mbm-marker--num"),
          text: node.marker,
        });
      }
    }

    const titleText = title.createSpan("mbm-title-text");
    jobs.push(this.renderTitle(titleText, node));

    if (node.blocks.length) {
      const body = card.createDiv("mbm-node-body");
      for (const block of node.blocks) {
        // 表格套一层外壳：内层负责限高滚动，外壳承托“放大”按钮与行数提示
        const outer =
          block.kind === "table" ? body.createDiv("mbm-table-outer") : null;
        const holder = (outer ?? body).createDiv(
          `mbm-block mbm-block--${block.kind}`
        );
        holder.dataset.line = String(block.line);
        if (outer) this.decorateTable(outer, holder);

        const job = MarkdownRenderer.render(
          this.app,
          block.md,
          holder,
          this.sourcePath,
          this.component
        ).catch(() => {
          holder.setText(block.md);
        });
        jobs.push(job.then(() => this.afterTableRender(outer, holder)));
      }
    }

    // 右下角缩放手柄（解锁后可用）
    const grip = el.createDiv("mbm-resize");
    grip.setAttribute("aria-label", "拖动调整卡片大小");
    grip.setAttribute("role", "button");

    // 右上角「放大查看整张卡片」
    const zoom = el.createDiv("mbm-card-zoom");
    zoom.setAttribute("role", "button");
    zoom.setAttribute("aria-label", "放大查看卡片");
    setIcon(zoom, "expand");
    zoom.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    zoom.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const hit = this.root ? this.findNode(this.root, node.id) : null;
      if (hit) this.openCardViewer(hit);
    });

    if (node.children.length) {
      const toggle = el.createDiv("mbm-toggle");
      toggle.setAttribute("role", "button");
      toggle.setAttribute("aria-label", "展开/折叠");
    }

    return el;
  }

  private async renderTitle(span: HTMLElement, node: MindNode) {
    const text = (node.title || "").trim() || "（空）";
    try {
      await MarkdownRenderer.render(
        this.app,
        text,
        span,
        this.sourcePath,
        this.component
      );
      unwrapParagraphs(span);
    } catch {
      span.setText(text);
    }
  }

  /** 表格外壳：右上角「放大」按钮 */
  private decorateTable(outer: HTMLElement, holder: HTMLElement) {
    const btn = outer.createEl("button", { cls: "mbm-zoom-btn" });
    btn.setAttribute("type", "button");
    btn.setAttribute("aria-label", "放大查看表格");
    setIcon(btn, "maximize");
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const host =
        (this.wrapper.closest(".mbm-container") as HTMLElement | null) ??
        this.wrapper;
      openTable(holder, host);
    });
    // 阻止按钮上的指针事件触发卡片拖动
    btn.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    outer.dataset.tableFor = "1";
  }

  /** 表格渲染完成后：统计行列、判断是否超高，给出「点击放大」提示 */
  private afterTableRender(outer: HTMLElement | null, holder: HTMLElement) {
    if (!outer) return;
    const table = holder.querySelector("table");
    if (!table) {
      outer.removeClass?.("mbm-table-outer");
      return;
    }
    const rows = table.querySelectorAll("tbody tr").length;
    const cols =
      table.querySelectorAll("thead th").length ||
      table.querySelectorAll("tr:first-child th, tr:first-child td").length;
    const overflow = holder.scrollHeight - holder.clientHeight > 4;
    outer.classList.toggle("is-overflow", overflow);
    if (overflow) {
      if (!outer.querySelector(".mbm-table-more")) {
        const more = outer.createDiv("mbm-table-more");
        more.setText(`共 ${rows} 行 × ${cols} 列 · 点击放大看全貌`);
        more.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const host =
            (this.wrapper.closest(".mbm-container") as HTMLElement | null) ??
            this.wrapper;
          openTable(holder, host);
        });
        more.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      }
    } else {
      outer.querySelector(".mbm-table-more")?.remove();
    }
  }

  private attachMediaListeners() {
    this.layer.querySelectorAll("img").forEach((img) => {
      if (img.dataset.mbmBound) return;
      img.dataset.mbmBound = "1";
      img.classList.add("mbm-media");
      img.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const host =
          (this.wrapper.closest(".mbm-container") as HTMLElement | null) ??
          this.wrapper;
        openImage(img, host);
      });
      img.addEventListener("pointerdown", (ev) => {
        // 图片上不启动卡片拖动，保证「点一下就是放大」
        ev.stopPropagation();
      });
      if (!img.complete) {
        const onDone = () => this.scheduleRemeasure();
        img.addEventListener("load", onDone, { once: true });
        img.addEventListener("error", onDone, { once: true });
      }
    });
  }

  private scheduleRemeasure() {
    if (this.destroyed) return;
    window.setTimeout(() => {
      if (!this.destroyed) this.relayout(false);
    }, 60);
  }

  /* ------------------------------------------------------------------ */
  /* 卡片放大与穿梭                                                      */
  /* ------------------------------------------------------------------ */

  /** 打开整张卡片的放大视图；方向键 / ‹ › 可在卡片之间切换 */
  openCardViewer(start: MindNode) {
    if (!this.els.has(start.id)) return;
    const host =
      (this.wrapper.closest(".mbm-container") as HTMLElement | null) ??
      this.wrapper;
    let cur = start.id;
    this.setActive(cur, { flash: false });

    const order = () => this.collectVisible();
    const jump = (id: string | null): boolean => {
      if (!id || !this.els.has(id)) return false;
      cur = id;
      this.setActive(cur, { flash: false });
      return true;
    };
    const indexOf = (list: MindNode[]) => list.findIndex((n) => n.id === cur);

    this.cardViewer?.close();
    this.cardViewer = openCard({
      themeHost: host,
      getSource: () => {
        const entry = this.els.get(cur);
        if (!entry) return null;
        const list = order();
        const i = indexOf(list);
        const kind =
          entry.node.kind === "root"
            ? "中心主题"
            : entry.node.kind === "heading"
            ? `第 ${entry.node.depth} 层标题`
            : "列表项";
        return {
          el: entry.el,
          title: plainTitle(entry.node.title),
          subtitle: `${kind} · ${i + 1} / ${list.length} · 方向键切换`,
        };
      },
      prev: () => {
        const list = order();
        const i = indexOf(list);
        return i > 0 ? jump(list[i - 1].id) : false;
      },
      next: () => {
        const list = order();
        const i = indexOf(list);
        return i >= 0 && i < list.length - 1 ? jump(list[i + 1].id) : false;
      },
      go: (dir: NavDir) => {
        const hit = this.spatialNeighbor(cur, dir);
        return hit ? jump(hit.id) : false;
      },
      onClose: () => {
        this.cardViewer = null;
        if (this.destroyed) return;
        this.scrollToNode(cur);
      },
    });
  }

  /** 按屏幕方位找最近的相邻卡片 */
  private spatialNeighbor(fromId: string, dir: NavDir): MindNode | null {
    const a = this.pos.get(fromId);
    if (!a) return null;
    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    let best: MindNode | null = null;
    let bestScore = Infinity;
    for (const [id, r] of this.pos) {
      if (id === fromId) continue;
      const entry = this.els.get(id);
      if (!entry) continue;
      const dx = r.x + r.w / 2 - ax;
      const dy = r.y + r.h / 2 - ay;
      let along = 0;
      let aside = 0;
      if (dir === "left") {
        if (dx > -8) continue;
        along = -dx;
        aside = Math.abs(dy);
      } else if (dir === "right") {
        if (dx < 8) continue;
        along = dx;
        aside = Math.abs(dy);
      } else if (dir === "up") {
        if (dy > -8) continue;
        along = -dy;
        aside = Math.abs(dx);
      } else {
        if (dy < 8) continue;
        along = dy;
        aside = Math.abs(dx);
      }
      // 同方向优先「正对着的」，再比距离
      const score = along + aside * 2.4;
      if (score < bestScore) {
        bestScore = score;
        best = entry.node;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* 布局与绘制                                                          */
  /* ------------------------------------------------------------------ */

  async relayout(animate: boolean) {
    if (!this.root) return;
    this.applySizes();
    const sizes = this.measure();
    const s = this.getSettings();
    const result = computeLayout(this.root, sizes, {
      mode: this.mode,
      gapX: s.gapX,
      gapY: s.gapY,
    });
    this.applyOffsets(result);
    this.commit(result, animate);
  }

  /** 把手工偏移叠加到自动布局结果上（父节点移动时子树跟随） */
  private applyOffsets(result: LayoutResult) {
    if (!this.offsets.size) {
      this.bounds = {
        x0: 0,
        y0: 0,
        x1: result.width,
        y1: result.height,
      };
      return;
    }
    const walk = (n: PlacedNode, accX: number, accY: number) => {
      const off = this.offsets.get(keyOf(n.node));
      const x = accX + (off?.dx ?? 0);
      const y = accY + (off?.dy ?? 0);
      n.x += x;
      n.y += y;
      for (const c of n.children) walk(c, x, y);
    };
    walk(result.root, 0, 0);

    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of result.nodes) {
      x0 = Math.min(x0, n.x);
      y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + n.w);
      y1 = Math.max(y1, n.y + n.h);
    }
    result.width = Math.max(1, x1 - x0);
    result.height = Math.max(1, y1 - y0);
    this.bounds = { x0, y0, x1, y1 };
  }

  private measure(): Map<string, Size> {
    const sizes = new Map<string, Size>();
    // 不再强行写入像素宽度：节点本身是 width:max-content + max-width，
    // 让浏览器按真实内容排布，避免“取整后比内容窄 1px 迫使文字换行”的老问题。
    for (const e of this.els.values()) {
      if (e.el.parentElement !== this.layer) continue;
      sizes.set(e.node.id, {
        w: Math.max(48, Math.ceil(e.el.offsetWidth)),
        h: Math.max(22, Math.ceil(e.el.offsetHeight)),
      });
    }
    return sizes;
  }

  private computeBounds(map: Map<string, Rect>): Bounds {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const r of map.values()) {
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.h);
    }
    if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    return { x0, y0, x1, y1 };
  }

  private commit(next: LayoutResult, animate: boolean) {
    const from = new Map(this.pos);
    const to = new Map<string, Rect>();
    for (const n of next.nodes) {
      to.set(n.id, { x: n.x, y: n.y, w: n.w, h: n.h });
    }
    const prevLayout = this.layout;
    this.layout = next;
    this.bounds = this.computeBounds(to);
    this.syncPaths(next);

    const canAnimate =
      animate && prevLayout !== null && from.size > 0 && next.nodes.length <= 500;

    if (!canAnimate) {
      window.cancelAnimationFrame(this.raf);
      this.pos = to;
      this.paint();
      this.updateStageSize();
      return;
    }

    window.cancelAnimationFrame(this.raf);
    const start = performance.now();
    const dur = 240;
    const startPos = new Map<string, Rect>();
    for (const [id, target] of to) {
      const f = from.get(id);
      startPos.set(id, f ? { x: f.x, y: f.y, w: target.w, h: target.h } : { ...target });
    }
    const step = () => {
      if (this.destroyed) return;
      const t = Math.min(1, (performance.now() - start) / dur);
      const e = easeOutCubic(t);
      if (t < 1) {
        const cur = new Map<string, Rect>();
        for (const [id, target] of to) {
          const f = startPos.get(id)!;
          cur.set(id, {
            x: f.x + (target.x - f.x) * e,
            y: f.y + (target.y - f.y) * e,
            w: target.w,
            h: target.h,
          });
        }
        this.pos = cur;
        this.paint();
        this.raf = window.requestAnimationFrame(step);
      } else {
        this.pos = to;
        this.paint();
        this.updateStageSize();
      }
    };
    this.raf = window.requestAnimationFrame(step);
  }

  private syncPaths(result: LayoutResult) {
    const wanted = new Set<string>();
    for (const edge of result.edges) {
      const key = edge.from.id + ">" + edge.to.id;
      wanted.add(key);
      if (!this.paths.has(key)) {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.classList.add("mbm-edge");
        p.dataset.key = key;
        if (edge.to.branch != null && this.getSettings().branchColors) {
          p.style.setProperty(
            "--mbm-branch",
            BRANCH_COLORS[Math.max(0, edge.to.branch) % BRANCH_COLORS.length]
          );
        }
        this.svg.appendChild(p);
        this.paths.set(key, p);
      }
    }
    for (const [key, p] of Array.from(this.paths.entries())) {
      if (!wanted.has(key)) {
        p.remove();
        this.paths.delete(key);
      }
    }
  }

  /** 把坐标写到 DOM 并重绘连线 */
  private paint() {
    if (!this.layout) return;
    const branchColors = this.getSettings().branchColors;
    for (const n of this.layout.nodes) {
      const r = this.pos.get(n.id);
      const entry = this.els.get(n.id);
      if (!r || !entry) continue;
      entry.el.style.left = `${r.x}px`;
      entry.el.style.top = `${r.y}px`;
      entry.el.dataset.side = String(n.side);
      entry.el.dataset.branch = String(n.branch);
      entry.el.classList.toggle("mbm-node--side-left", n.side === -1);
      if (branchColors && n.depth > 0) {
        entry.el.style.setProperty(
          "--mbm-branch",
          BRANCH_COLORS[Math.max(0, n.branch) % BRANCH_COLORS.length]
        );
        entry.el.classList.add("mbm-has-branch");
      } else {
        entry.el.classList.remove("mbm-has-branch");
      }
      const toggle = entry.el.querySelector<HTMLElement>(".mbm-toggle");
      if (toggle) {
        toggle.classList.toggle("mbm-toggle--left", n.side === -1);
        toggle.classList.toggle("mbm-toggle--down", this.mode === "down");
      }
    }
    this.drawEdges();
  }

  private drawEdges() {
    if (!this.layout) return;
    for (const edge of this.layout.edges) {
      const a = this.pos.get(edge.from.id);
      const b = this.pos.get(edge.to.id);
      const path = this.paths.get(edge.from.id + ">" + edge.to.id);
      if (!a || !b || !path) continue;
      path.setAttribute("d", this.edgePath(a, b, edge.to.side));
      // 首尾相接处稍微内缩，避免压住卡片圆角
      path.style.strokeWidth = `${this.getSettings().lineWidth}`;
    }
  }

  private edgePath(a: Rect, b: Rect, side: 1 | -1): string {
    const style = this.getSettings().lineStyle;
    if (this.mode === "down") {
      const sx = a.x + a.w / 2;
      const sy = a.y + a.h;
      const ex = b.x + b.w / 2;
      const ey = b.y;
      if (style === "straight") return `M ${sx} ${sy} L ${ex} ${ey}`;
      if (style === "elbow") {
        const my = (sy + ey) / 2;
        return `M ${sx} ${sy} L ${sx} ${my} L ${ex} ${my} L ${ex} ${ey}`;
      }
      const dy = Math.max(18, (ey - sy) * 0.45);
      return `M ${sx} ${sy} C ${sx} ${sy + dy}, ${ex} ${ey - dy}, ${ex} ${ey}`;
    }

    const sx = side === 1 ? a.x + a.w : a.x;
    const sy = a.y + a.h / 2;
    const ex = side === 1 ? b.x : b.x + b.w;
    const ey = b.y + b.h / 2;

    if (style === "straight") return `M ${sx} ${sy} L ${ex} ${ey}`;
    if (style === "elbow") {
      const mx = sx + ((ex - sx) / 2);
      return `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ey} L ${ex} ${ey}`;
    }
    const dx = Math.max(18, Math.abs(ex - sx) * 0.45) * side;
    return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${ex - dx} ${ey}, ${ex} ${ey}`;
  }

  private updateStageSize() {
    const b = this.bounds;
    const pad = 90;
    const x0 = Math.floor(b.x0 - pad);
    const y0 = Math.floor(b.y0 - pad);
    const w = Math.ceil(b.x1 - b.x0) + pad * 2;
    const h = Math.ceil(b.y1 - b.y0) + pad * 2;

    // 内容可能是负坐标（卡片被拖到左上角外面），SVG 用 viewBox 平移对齐
    this.svg.style.left = `${x0}px`;
    this.svg.style.top = `${y0}px`;
    this.svg.setAttribute("width", String(w));
    this.svg.setAttribute("height", String(h));
    this.svg.setAttribute("viewBox", `${x0} ${y0} ${w} ${h}`);
    this.updateVBar();
  }

  /* ------------------------------------------------------------------ */
  /* 视图变换                                                            */
  /* ------------------------------------------------------------------ */

  private applyTransform(animate = false) {
    if (animate) {
      this.stage.addClass("mbm-stage--anim");
      window.setTimeout(() => this.stage.removeClass("mbm-stage--anim"), 240);
    }
    const { x, y, k } = this.view;
    this.stage.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    this.gridEl.style.backgroundPosition = `${x}px ${y}px`;
    this.updateVBar();
    this.cb.onZoom?.(k);
  }

  /* ------------------------------------------------------------------ */
  /* 右侧滚动条                                                          */
  /* ------------------------------------------------------------------ */

  private bindVBar() {
    const bar = this.vbar;
    const thumb = this.vbarThumb;
    if (!bar || !thumb) return;
    const comp = this.component;

    comp.registerDomEvent(thumb, "pointerdown", (ev: PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const span = this.bounds.y1 - this.bounds.y0;
      if (!span) return;
      capture(thumb, ev.pointerId);
      this.vbarDrag = {
        y: ev.clientY,
        vy: this.view.y,
        range: span,
        trackH: bar.clientHeight || 1,
      };
      thumb.addClass("is-drag");
    });

    comp.registerDomEvent(window, "pointermove", (ev: PointerEvent) => {
      const d = this.vbarDrag;
      if (!d) return;
      const dy = ev.clientY - d.y;
      this.view.y = d.vy - (dy / Math.max(1, d.trackH)) * d.range * this.view.k;
      this.applyTransform(false);
    });

    const end = () => {
      if (this.vbarDrag) {
        this.vbarDrag = null;
        thumb.removeClass("is-drag");
      }
    };
    comp.registerDomEvent(window, "pointerup", end);
    comp.registerDomEvent(window, "pointercancel", end);

    // 点轨道：把点击位置的内容挪到屏幕中间
    comp.registerDomEvent(bar, "pointerdown", (ev: PointerEvent) => {
      if ((ev.target as HTMLElement)?.closest(".mbm-vbar-thumb")) return;
      const span = this.bounds.y1 - this.bounds.y0;
      if (!span) return;
      const rect = bar.getBoundingClientRect();
      const ratio = clamp((ev.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
      const contentTop = this.bounds.y0 + ratio * span;
      this.view.y = -contentTop * this.view.k;
      this.applyTransform(false);
      ev.preventDefault();
      ev.stopPropagation();
    });
  }

  private updateVBar() {
    const bar = this.vbar;
    const thumb = this.vbarThumb;
    if (!bar || !thumb || this.destroyed) return;
    const vh = this.viewport.clientHeight;
    const span = this.bounds.y1 - this.bounds.y0;
    const k = this.view.k;
    if (span <= 0 || span * k <= vh + 2) {
      bar.addClass("is-hidden");
      return;
    }
    bar.removeClass("is-hidden");
    const trackH = bar.clientHeight || vh;
    const visTop = -this.view.y / k;
    const visH = vh / k;
    const thumbH = clamp((visH / span) * trackH, 34, trackH);
    const maxTop = Math.max(0, trackH - thumbH);
    const ratio = clamp((visTop - this.bounds.y0) / Math.max(1, span - visH), 0, 1);
    thumb.style.height = `${Math.round(thumbH)}px`;
    thumb.style.transform = `translateY(${Math.round(ratio * maxTop)}px)`;
  }

  /* ------------------------------------------------------------------ */
  /* 键盘 / 快捷平移                                                     */
  /* ------------------------------------------------------------------ */

  /** 竖向平移（正数向下看） */
  panBy(dx: number, dy: number) {
    this.view.x += dx;
    this.view.y += dy;
    this.applyTransform(false);
  }

  /** 把内容按屏高翻页 */
  panPage(dir: 1 | -1) {
    const vh = this.viewport.clientHeight || 600;
    this.panBy(0, -dir * vh * 0.82);
  }

  /* ------------------------------------------------------------------ */
  /* 单字强调（每个加粗片段可单独设置）                                   */
  /* ------------------------------------------------------------------ */

  private strongKeyOf(node: MindNode, idx: number, text: string) {
    const t = (text || "").replace(/\s+/g, " ").trim().slice(0, 30);
    return `${node.line}|${idx}|${t}`;
  }

  private annotateAllStrong() {
    for (const entry of this.els.values()) this.annotateStrong(entry.el, entry.node);
  }

  private annotateStrong(card: HTMLElement, node: MindNode) {
    const list = Array.from(
      card.querySelectorAll<HTMLElement>(
        ".mbm-title-text strong, .mbm-title-text b, .mbm-node-body strong, .mbm-node-body b"
      )
    );
    const map = this.getSettings().strongOverrides?.[this.sourcePath] ?? {};
    list.forEach((el, i) => {
      const key = this.strongKeyOf(node, i, el.textContent ?? "");
      el.dataset.mk = key;
      el.dataset.node = node.id;
      this.paintStrong(el, (map[key] as StrongStyle) ?? null);
      if (el.dataset.menuBound !== "1") {
        el.dataset.menuBound = "1";
        el.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.cb.onStrongMenu?.(node, el, el.dataset.mk ?? key, ev);
        });
      }
    });
  }

  /** 用内联 !important 上色：单字设置永远压过层级规则 */
  paintStrong(el: HTMLElement, style: StrongStyle | null) {
    const st = el.style;
    const PROPS = [
      "color",
      "background-color",
      "-webkit-text-stroke",
      "text-decoration",
      "text-decoration-color",
      "text-decoration-thickness",
      "text-underline-offset",
    ];
    for (const p of PROPS) st.removeProperty(p);
    if (!style) return;
    if (this.getSettings().emphasis === false) return;
    const set = (p: string, v: string) => st.setProperty(p, v, "important");
    switch (style) {
      case "mark":
        set("color", "var(--mbm-strong-text)");
        set("background-color", "var(--mbm-strong-bg)");
        set("-webkit-text-stroke", "0.042em currentColor");
        set("text-decoration", "none");
        break;
      case "underline":
        set("-webkit-text-stroke", "0.042em currentColor");
        set("background-color", "transparent");
        set("text-decoration", "underline");
        set("text-decoration-color", "var(--mbm-strong-accent)");
        set("text-decoration-thickness", "0.09em");
        set("text-underline-offset", "0.16em");
        break;
      case "color":
        set("color", "var(--mbm-strong-accent)");
        set("-webkit-text-stroke", "0.042em currentColor");
        set("background-color", "transparent");
        set("text-decoration", "none");
        break;
      case "bold":
        set("-webkit-text-stroke", "0.055em currentColor");
        set("background-color", "transparent");
        set("text-decoration", "none");
        break;
      case "none":
        set("color", "inherit");
        set("background-color", "transparent");
        set("-webkit-text-stroke", "0");
        set("text-decoration", "none");
        break;
    }
  }

  /** 单独刷新某个片段（右键改完立刻生效，不用整图重排） */
  paintStrongByKey(key: string, style: StrongStyle | null) {
    for (const el of Array.from(this.layer.querySelectorAll<HTMLElement>("[data-mk]"))) {
      if (el.dataset.mk === key) this.paintStrong(el, style);
    }
  }

  /** 清空所有单字设置后的重绘 */
  repaintAllStrong() {
    this.annotateAllStrong();
  }

  setView(v: { x: number; y: number; k: number }, animate = false) {
    this.view = { x: v.x, y: v.y, k: clamp(v.k, 0.08, 3) };
    this.applyTransform(animate);
  }

  getZoom() {
    return this.view.k;
  }

  zoomBy(factor: number, cx?: number, cy?: number) {
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    const px = cx ?? vw / 2;
    const py = cy ?? vh / 2;
    const k0 = this.view.k;
    const k = clamp(k0 * factor, 0.08, 3);
    if (Math.abs(k - k0) < 1e-4) return;
    this.view.x = px - ((px - this.view.x) / k0) * k;
    this.view.y = py - ((py - this.view.y) / k0) * k;
    this.view.k = k;
    this.applyTransform(false);
  }

  zoomTo(k: number, animate = true) {
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    const kk = clamp(k, 0.08, 3);
    const cx = vw / 2;
    const cy = vh / 2;
    const wx = (cx - this.view.x) / this.view.k;
    const wy = (cy - this.view.y) / this.view.k;
    this.setView({ x: cx - wx * kk, y: cy - wy * kk, k: kk }, animate);
  }

  fit(animate = true) {
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    if (!this.layout || vw < 20 || vh < 20) return;
    const pad = 56;
    const b = this.bounds;
    const w = Math.max(1, b.x1 - b.x0);
    const h = Math.max(1, b.y1 - b.y0);
    const k = clamp(
      Math.min((vw - pad * 2) / w, (vh - pad * 2) / h, 1.25),
      0.08,
      2
    );
    this.setView(
      {
        x: (vw - w * k) / 2 - b.x0 * k,
        y: (vh - h * k) / 2 - b.y0 * k,
        k,
      },
      animate
    );
    this.fitted = true;
  }

  center() {
    if (!this.layout) return;
    const b = this.bounds;
    this.setView(
      {
        x: this.viewport.clientWidth / 2 - ((b.x0 + b.x1) / 2) * this.view.k,
        y: this.viewport.clientHeight / 2 - ((b.y0 + b.y1) / 2) * this.view.k,
        k: this.view.k,
      },
      true
    );
  }

  /** 让某个节点成为视口中心（拖动结束后用） */
  centerOnNode(node: MindNode) {
    if (this.pos.has(node.id)) this.scrollToNode(node.id);
  }

  /* ------------------------------------------------------------------ */
  /* 事件                                                                */
  /* ------------------------------------------------------------------ */

  private bindEvents() {
    const comp = this.component;

    comp.registerDomEvent(this.viewport, "wheel", (ev: WheelEvent) => {
      const s = this.getSettings();
      const zoomIntent = ev.ctrlKey || ev.metaKey || (s.wheel === "zoom" && !ev.shiftKey);
      ev.preventDefault();
      ev.stopPropagation();
      if (zoomIntent) {
        const rect = this.viewport.getBoundingClientRect();
        const factor = Math.exp(-ev.deltaY * 0.0016);
        this.zoomBy(factor, ev.clientX - rect.left, ev.clientY - rect.top);
      } else {
        this.view.x -= ev.deltaX;
        this.view.y -= ev.deltaY;
        this.applyTransform(false);
      }
    }, { passive: false });

    comp.registerDomEvent(this.viewport, "pointerdown", (ev: PointerEvent) => {
      // 点一下画布就把焦点拿回来，方向键才能直接平移
      try {
        this.viewport.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
      if (ev.button === 2) return;
      const target = ev.target as HTMLElement | null;

      // 右下角缩放手柄
      if (target?.closest(".mbm-resize") && ev.button === 0) {
        const nodeEl = target.closest<HTMLElement>(".mbm-node");
        const id = nodeEl?.dataset.id;
        const node = id && this.root ? this.findNode(this.root, id) : null;
        if (nodeEl && node) {
          if (this.locked) {
            new Notice("画布已锁定，先解锁再调整卡片大小");
            return;
          }
          this.beginResize(node, nodeEl, ev);
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
      }

      // 链接、折叠按钮、输入框、表格放大按钮：交给它们自己处理
      if (target?.closest("a, .internal-link, textarea, input, .mbm-toggle, .mbm-zoom-btn, .mbm-card-zoom, .mbm-table-more"))
        return;

      const nodeEl = target?.closest<HTMLElement>(".mbm-node");
      if (nodeEl && ev.button === 0 && !this.locked) {
        const id = nodeEl.dataset.id;
        const node = id && this.root ? this.findNode(this.root, id) : null;
        if (node) {
          this.beginNodeDrag(node, nodeEl, ev);
          ev.preventDefault();
          return;
        }
      }

      this.panState = {
        x: ev.clientX,
        y: ev.clientY,
        vx: this.view.x,
        vy: this.view.y,
      };
      this.viewport.addClass("is-panning");
      capture(ev.target as Element, ev.pointerId);
      if (!nodeEl) ev.preventDefault();
    });

    const onMove = (ev: PointerEvent) => {
      if (this.resizeState) {
        this.moveResize(ev);
        return;
      }
      if (this.nodeDrag) {
        this.moveNodeDrag(ev);
        return;
      }
      if (!this.panState) return;
      this.view.x = this.panState.vx + (ev.clientX - this.panState.x);
      this.view.y = this.panState.vy + (ev.clientY - this.panState.y);
      this.applyTransform(false);
    };
    const onUp = (ev: PointerEvent) => {
      if (this.resizeState) {
        this.endResize(ev);
        return;
      }
      if (this.nodeDrag) {
        this.endNodeDrag(ev);
        return;
      }
      if (!this.panState) return;
      this.panState = null;
      this.viewport.removeClass("is-panning");
    };
    comp.registerDomEvent(window, "pointermove", onMove);
    comp.registerDomEvent(window, "pointerup", onUp);
    comp.registerDomEvent(window, "pointercancel", onUp);

    comp.registerDomEvent(this.layer, "click", (ev: MouseEvent) => {
      const target = ev.target as HTMLElement;
      if (target.closest("a, .internal-link, .external-link")) return;
      const nodeEl = target.closest<HTMLElement>(".mbm-node");
      if (!nodeEl) return;
      const id = nodeEl.dataset.id;
      if (!id) return;
      const node = this.root ? this.findNode(this.root, id) : null;
      if (!node) return;

      if (target.closest(".mbm-toggle")) {
        ev.preventDefault();
        ev.stopPropagation();
        this.cb.onToggle(node);
        return;
      }
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      this.setActive(id, { flash: false });
      this.cb.onSelect(node);
    });

    comp.registerDomEvent(this.layer, "dblclick", (ev: MouseEvent) => {
      const target = ev.target as HTMLElement;
      const nodeEl = target.closest<HTMLElement>(".mbm-node");
      if (!nodeEl || !target.closest(".mbm-title")) return;
      const id = nodeEl.dataset.id;
      if (!id) return;
      const node = this.root ? this.findNode(this.root, id) : null;
      if (!node) return;
      if (this.locked) {
        new Notice("画布已锁定，先点右上角的锁图标解锁再编辑");
        return;
      }
      this.startEdit(nodeEl, node);
    });

    comp.registerDomEvent(this.layer, "contextmenu", (ev: MouseEvent) => {
      const target = ev.target as HTMLElement;
      const nodeEl = target.closest<HTMLElement>(".mbm-node");
      if (!nodeEl) return;
      const id = nodeEl.dataset.id;
      if (!id) return;
      const node = this.root ? this.findNode(this.root, id) : null;
      if (!node) return;
      ev.preventDefault();
      this.setActive(id, { flash: false });
      this.cb.onMenu(node, ev);
    });

    comp.registerDomEvent(this.viewport, "keydown", (ev: KeyboardEvent) => {
      if (this.editing) return;
      if ((ev.target as HTMLElement | null)?.closest("textarea, input")) return;

      // 方向键平移：触控板不方便时用键盘上下滑动
      if (ev.key.startsWith("Arrow") && !ev.altKey) {
        const step = ev.shiftKey ? 260 : 96;
        ev.preventDefault();
        if (ev.key === "ArrowUp") this.panBy(0, step);
        else if (ev.key === "ArrowDown") this.panBy(0, -step);
        else if (ev.key === "ArrowLeft") this.panBy(step, 0);
        else this.panBy(-step, 0);
        return;
      }
      if (ev.key === "PageDown" || ev.key === "PageUp") {
        ev.preventDefault();
        this.panPage(ev.key === "PageDown" ? 1 : -1);
        return;
      }
      if (ev.key === "Home" && this.root) {
        ev.preventDefault();
        this.setActive(this.root.id, { scroll: true, flash: true });
        return;
      }
      if (ev.key === "+" || ev.key === "=") {
        this.zoomBy(1.15);
        ev.preventDefault();
        return;
      }
      if (ev.key === "-") {
        this.zoomBy(0.87);
        ev.preventDefault();
        return;
      }
      if (ev.key === "0") {
        this.fit(true);
        ev.preventDefault();
        return;
      }
      if (ev.key === "Escape") {
        this.clearSelection();
        return;
      }

      const node = this.getSelected();
      if (!node) return;
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.openCardViewer(node);
        return;
      }
      if (ev.key === "Tab") {
        ev.preventDefault();
        if (this.locked) {
          new Notice("画布已锁定，先解锁再调整层级");
          return;
        }
        this.cb.onStructure(ev.shiftKey ? "outdent" : "indent", node);
        return;
      }
      if (ev.altKey && (ev.key === "ArrowUp" || ev.key === "ArrowDown")) {
        ev.preventDefault();
        if (this.locked) {
          new Notice("画布已锁定，先解锁再调整顺序");
          return;
        }
        this.cb.onStructure(ev.key === "ArrowUp" ? "up" : "down", node);
      }
    });

    const ro = new ResizeObserver(() => {
      if (this.destroyed) return;
      if (!this.fitted && this.layout) this.fit(false);
      else this.applyTransform(false);
    });
    ro.observe(this.viewport);
    comp.register(() => ro.disconnect());
  }

  /* ------------------------------------------------------------------ */
  /* 卡片拖动                                                            */
  /* ------------------------------------------------------------------ */

  private subtreeKeys(node: MindNode): Set<string> {
    const out = new Set<string>();
    const walk = (n: MindNode) => {
      out.add(n.id);
      n.children.forEach(walk);
    };
    walk(node);
    return out;
  }

  private beginResize(node: MindNode, el: HTMLElement, ev: PointerEvent) {
    const r = this.pos.get(node.id);
    const w0 = Math.round(r?.w ?? el.offsetWidth);
    const h0 = Math.round(r?.h ?? el.offsetHeight);
    this.resizeState = {
      node,
      key: keyOf(node),
      el,
      sx: ev.clientX,
      sy: ev.clientY,
      w0,
      h0,
      w: w0,
      h: h0,
      moved: false,
    };
    el.addClass("is-resizing");
    this.viewport.addClass("is-resizing-node");
    capture(ev.target as Element, ev.pointerId);
    this.cb.onResize(node, { w: w0, h: h0 }, "start");
  }

  private moveResize(ev: PointerEvent) {
    const st = this.resizeState;
    if (!st) return;
    const k = this.view.k;
    const w = Math.round(Math.min(920, Math.max(140, st.w0 + (ev.clientX - st.sx) / k)));
    const h = Math.round(Math.min(1500, Math.max(44, st.h0 + (ev.clientY - st.sy) / k)));
    if (!st.moved && Math.abs(w - st.w0) < 2 && Math.abs(h - st.h0) < 2) return;
    st.moved = true;
    st.w = w;
    st.h = h;
    st.el.style.width = `${w}px`;
    st.el.style.height = `${h}px`;
    st.el.addClass("mbm-node--sized");
    if (this.resizeRaf) return;
    this.resizeRaf = window.requestAnimationFrame(() => {
      this.resizeRaf = 0;
      // 拖拽中只重算布局，不做过渡动画
      void this.relayout(false);
    });
  }

  private endResize(ev: PointerEvent) {
    const st = this.resizeState;
    this.resizeState = null;
    if (!st) return;
    st.el.removeClass("is-resizing");
    this.viewport.removeClass("is-resizing-node");
    this.suppressClick = true;
    window.setTimeout(() => {
      this.suppressClick = false;
    }, 80);
    if (!st.moved) {
      this.cb.onResize(st.node, null, "end");
      return;
    }
    this.sizes.set(st.key, { w: st.w, h: st.h });
    this.cb.onResize(st.node, { w: st.w, h: st.h }, "end");
    void this.relayout(false);
  }

  private beginNodeDrag(node: MindNode, el: HTMLElement, ev: PointerEvent) {
    this.viewport.focus({ preventScroll: true });
    this.nodeDrag = {
      node,
      key: keyOf(node),
      sx: ev.clientX,
      sy: ev.clientY,
      dx: 0,
      dy: 0,
      moved: false,
      mode: ev.altKey ? "reparent" : "move",
      base: new Map(this.pos),
      subtree: this.subtreeKeys(node),
      targetEl: null,
    };
    this.viewport.addClass("is-node-pressing");
    el.addClass("is-pressing");
    capture(ev.target as Element, ev.pointerId);
  }

  private moveNodeDrag(ev: PointerEvent) {
    const d = this.nodeDrag;
    if (!d) return;
    const k = this.view.k;
    const rawDx = (ev.clientX - d.sx) / k;
    const rawDy = (ev.clientY - d.sy) / k;
    if (!d.moved) {
      if (Math.hypot(rawDx, rawDy) * k < 4) return;
      d.moved = true;
      this.viewport.addClass("is-dragging-node");
      this.els.get(d.node.id)?.el.addClass("is-dragging");
      this.els.get(d.node.id)?.el.removeClass("is-pressing");
    }
    d.dx = rawDx;
    d.dy = rawDy;

    if (d.mode === "move") {
      for (const [id, r] of d.base) {
        if (!d.subtree.has(id)) continue;
        this.pos.set(id, { x: r.x + d.dx, y: r.y + d.dy, w: r.w, h: r.h });
      }
      this.paint();
      return;
    }

    // 改层级模式：找鼠标下面的目标节点
    const hit = document.elementFromPoint(ev.clientX, ev.clientY);
    const targetEl = hit?.closest<HTMLElement>(".mbm-node") ?? null;
    const id = targetEl?.dataset.id ?? null;
    let valid = !!id && !!this.root && !d.subtree.has(id);
    if (valid && targetEl) {
      if (targetEl === this.els.get(d.node.id)?.el) valid = false;
    }
    if (d.targetEl && d.targetEl !== targetEl) d.targetEl.removeClass("is-drop-target");
    d.targetEl = valid ? targetEl : null;
    d.targetEl?.addClass("is-drop-target");
  }

  private endNodeDrag(ev: PointerEvent) {
    const d = this.nodeDrag;
    this.nodeDrag = null;
    this.viewport.removeClass("is-dragging-node", "is-node-pressing");
    const el = this.els.get(d?.node.id ?? "")?.el;
    el?.removeClass("is-dragging", "is-pressing");
    if (!d) return;
    if (!d.moved) return;

    this.suppressClick = true;
    window.setTimeout(() => {
      this.suppressClick = false;
    }, 80);

    if (d.mode === "move") {
      const prev = this.offsets.get(d.key) ?? { dx: 0, dy: 0 };
      this.offsets.set(d.key, {
        dx: Math.round(prev.dx + d.dx),
        dy: Math.round(prev.dy + d.dy),
      });
      this.cb.onOffsetsChange(this.offsetsObject(), d.node, prev);
      void this.relayout(false);
      return;
    }

    const targetEl = d.targetEl;
    if (!targetEl) {
      // 没有落到任何节点上：还原
      void this.relayout(false);
      return;
    }
    const id = targetEl.dataset.id;
    const target = id && this.root ? this.findNode(this.root, id) : null;
    if (!target) return;
    this.cb.onReparent(d.node, target);
    targetEl.removeClass("is-drop-target");
  }

  private offsetsObject(): Record<string, { dx: number; dy: number }> {
    const out: Record<string, { dx: number; dy: number }> = {};
    for (const [k, v] of this.offsets) out[k] = { dx: v.dx, dy: v.dy };
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 行内编辑                                                            */
  /* ------------------------------------------------------------------ */

  private async startEdit(el: HTMLElement, node: MindNode) {
    if (!node.edit) {
      new Notice("这是文档根节点，标题来自文件名或 frontmatter，请直接修改文件名/属性");
      return;
    }
    if (this.editing) return;
    this.editing = true;
    const holder = el.querySelector<HTMLElement>(".mbm-title");
    if (!holder) {
      this.editing = false;
      return;
    }
    const ta = document.createElement("textarea");
    ta.className = "mbm-edit";
    ta.value = node.title;
    ta.spellcheck = false;
    holder.empty();
    holder.appendChild(ta);
    ta.focus();
    ta.select();

    let done = false;
    const finish = async (commit: boolean) => {
      if (done) return;
      done = true;
      const value = ta.value.trim();
      ta.remove();
      this.editing = false;
      const span = holder.createSpan("mbm-title-text");
      await this.renderTitle(span, node);
      if (commit && value && value !== node.title) this.cb.onEdit(node, value);
    };

    ta.addEventListener("keydown", (ev: KeyboardEvent) => {
      ev.stopPropagation();
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        void finish(true);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        void finish(false);
      }
    });
    ta.addEventListener("blur", () => void finish(false));
  }

  /* ------------------------------------------------------------------ */
  /* 清理                                                                */
  /* ------------------------------------------------------------------ */

  destroy() {
    this.destroyed = true;
    this.cardViewer?.close();
    this.cardViewer = null;
    window.cancelAnimationFrame(this.raf);
    this.wrapper.remove();
  }
}
