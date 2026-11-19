import {
  App,
  ItemView,
  MarkdownView,
  Menu,
  Modal,
  Notice,
  TFile,
  ViewStateResult,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import {
  ViewAdjust,
  applyAdjust,
  cloneAdjust,
  countAdjust,
  createAdjust,
  indentNode,
  keyOf,
  moveSibling,
  offsetsOf,
  outdentNode,
  reparentTo,
  resetNodeAdjust,
  retitleAdjust,
  setOffset,
  setSize,
  sizesOf,
} from "./adjust";
import { MindmapCanvas, StrongStyle } from "./canvas";
import { History, Snapshot } from "./history";
import { parseMarkdown } from "./parser";
import { DEFAULT_SETTINGS, LayoutMode, MindNode, MubuSettings } from "./types";
import type MubuMindmapPlugin from "./main";

export const VIEW_TYPE = "mubu-mindmap-view";

const LAYOUTS: Array<{ mode: LayoutMode; label: string; icon: string }> = [
  { mode: "mindmap", label: "思维导图（左右展开）", icon: "git-fork" },
  { mode: "right", label: "向右逻辑图", icon: "arrow-right" },
  { mode: "left", label: "向左逻辑图", icon: "arrow-left" },
  { mode: "down", label: "向下大纲图", icon: "arrow-down" },
];

/* ------------------------------------------------------------------ */
/* 悬浮提示：统一一个浮层，避免被工具栏的 overflow 裁掉                  */
/* ------------------------------------------------------------------ */

let tipEl: HTMLElement | null = null;
let tipTimer = 0;

function ensureTip(): HTMLElement {
  if (!tipEl || !tipEl.isConnected) {
    tipEl = document.body.createDiv("mbm-tip");
  }
  return tipEl;
}

function hideTip() {
  if (tipTimer) {
    window.clearTimeout(tipTimer);
    tipTimer = 0;
  }
  if (tipEl) tipEl.removeClass("is-visible");
}

function bindTip(el: HTMLElement, getText: () => string) {
  const show = () => {
    if (tipTimer) window.clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => {
      const text = getText();
      if (!text) return;
      const tip = ensureTip();
      tip.setText(text);
      tip.addClass("is-visible");
      const r = el.getBoundingClientRect();
      const tr = tip.getBoundingClientRect();
      let x = r.left + r.width / 2 - tr.width / 2;
      x = Math.max(8, Math.min(x, window.innerWidth - tr.width - 8));
      let y = r.bottom + 8;
      if (y + tr.height > window.innerHeight - 8) y = r.top - tr.height - 8;
      tip.setCssStyles({ left: `${Math.round(x)}px` });
      tip.setCssStyles({ top: `${Math.round(y)}px` });
    }, 170);
  };
  el.addEventListener("pointerenter", show);
  el.addEventListener("pointerleave", hideTip);
  el.addEventListener("pointerdown", hideTip);
  el.addEventListener("blur", hideTip);
}

/* ------------------------------------------------------------------ */

interface ModalAction {
  label: string;
  cta?: boolean;
  warning?: boolean;
  run: () => void;
}

class ActionModal extends Modal {
  constructor(
    app: App,
    private titleText: string,
    private message: string,
    private actions: ModalAction[]
  ) {
    super(app);
  }

  onOpen() {
    this.titleEl.setText(this.titleText);
    this.contentEl.createEl("p", { text: this.message });
    const row = this.contentEl.createDiv("mbm-modal-actions");
    const cancel = row.createEl("button", { text: "取消" });
    cancel.onclick = () => this.close();
    for (const action of this.actions) {
      const btn = row.createEl("button", {
        text: action.label,
        cls: action.warning ? "mod-warning" : action.cta ? "mod-cta" : "",
      });
      btn.onclick = () => {
        this.close();
        action.run();
      };
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** 把节点挂到另一个节点下时的选择器 */
class NodePickerModal extends Modal {
  private query = "";
  private listEl!: HTMLElement;

  constructor(
    app: App,
    private source: MindNode,
    private root: MindNode,
    private onPick: (target: MindNode) => void
  ) {
    super(app);
  }

  onOpen() {
    this.titleEl.setText("移动层级");
    this.contentEl.createEl("p", {
      cls: "mbm-picker-hint",
      text: `把「${this.source.title || "未命名"}」挂到下面任意节点下（只影响导图，不改动 Markdown）。`,
    });
    const input = this.contentEl.createEl("input", {
      cls: "mbm-picker-input",
      attr: { type: "text", placeholder: "搜索节点标题…" },
    });
    input.addEventListener("input", () => {
      this.query = input.value.trim().toLowerCase();
      this.renderList();
    });
    this.listEl = this.contentEl.createDiv("mbm-picker-list");
    this.renderList();
    input.focus();
  }

  private renderList() {
    this.listEl.empty();
    const rootRow = this.listEl.createDiv("mbm-picker-row mbm-picker-row--root");
    rootRow.createSpan({ cls: "mbm-picker-title", text: "（挂到根节点）" });
    rootRow.addEventListener("click", () => {
      this.close();
      this.onPick(this.root);
    });

    const excluded = new Set<MindNode>();
    const mark = (n: MindNode) => {
      excluded.add(n);
      n.children.forEach(mark);
    };
    mark(this.source);

    const walk = (n: MindNode, depth: number) => {
      for (const c of n.children) {
        if (excluded.has(c)) continue;
        const title = (c.title || "（空）").toLowerCase();
        if (!this.query || title.includes(this.query)) {
          const row = this.listEl.createDiv("mbm-picker-row");
          row.setCssStyles({ paddingLeft: `${8 + depth * 14}px` });
          row.createSpan({ cls: "mbm-picker-title", text: c.title || "（空）" });
          row.addEventListener("click", () => {
            this.close();
            this.onPick(c);
          });
        }
        walk(c, depth + 1);
      }
    };
    walk(this.root, 0);
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** 快速跳转：输入关键字，回车直达节点 */
class JumpModal extends Modal {
  private inputEl!: HTMLInputElement;
  private listEl!: HTMLElement;
  private rows: Array<{ el: HTMLElement; node: MindNode }> = [];
  private active = 0;
  private filtered: Array<{ node: MindNode; crumb: string }> = [];

  constructor(
    app: App,
    private all: Array<{ node: MindNode; crumb: string }>,
    private onPick: (node: MindNode) => void
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("mbm-jump");
    this.modalEl.addClass("mbm-jump-modal-wrap");

    this.inputEl = contentEl.createEl("input", {
      cls: "mbm-jump-input",
      attr: { placeholder: "输入标题 / 关键词，↑↓ 选择，Enter 跳转", type: "text" },
    });
    this.listEl = contentEl.createDiv("mbm-jump-list");
    const foot = contentEl.createDiv("mbm-jump-foot");
    foot.createSpan({ text: "回车跳转 · Esc 关闭" });
    foot.createSpan({ text: "右键卡片上的粗体可单独设置强调方式" });

    this.inputEl.addEventListener("input", () => this.refresh());
    this.inputEl.addEventListener("keydown", (ev) => this.onKey(ev));
    window.setTimeout(() => this.inputEl.focus(), 0);
    this.refresh();
  }

  onClose() {
    this.contentEl.empty();
  }

  private onKey(ev: KeyboardEvent) {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!this.filtered.length) return;
      const d = ev.key === "ArrowDown" ? 1 : -1;
      this.active = (this.active + d + this.filtered.length) % this.filtered.length;
      this.paintActive();
      return;
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      const hit = this.filtered[this.active];
      if (hit) {
        this.onPick(hit.node);
        this.close();
      }
      return;
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      this.close();
    }
  }

  private refresh() {
    const q = this.inputEl.value.trim().toLowerCase();
    const scored: Array<{ node: MindNode; crumb: string; score: number }> = [];
    for (const it of this.all) {
      const title = (it.node.title || "").toLowerCase();
      const body = (it.node.blocks ?? [])
        .map((b) => b.md)
        .join(" ")
        .toLowerCase();
      let score = -1;
      if (!q) score = 0;
      else if (title === q) score = 100;
      else if (title.startsWith(q)) score = 80;
      else if (title.includes(q)) score = 60;
      else if (body.includes(q)) score = 30;
      if (score >= 0) scored.push({ node: it.node, crumb: it.crumb, score });
    }
    scored.sort((a, b) => b.score - a.score);
    this.filtered = scored.map((x) => ({ node: x.node, crumb: x.crumb }));
    this.active = 0;
    this.listEl.empty();
    this.rows = [];
    if (!this.filtered.length) {
      this.listEl.createDiv({ cls: "mbm-jump-empty", text: "没有匹配的节点" });
      return;
    }
    for (const [i, it] of this.filtered.slice(0, 200).entries()) {
      const row = this.listEl.createDiv("mbm-jump-row");
      if (it.crumb) row.createSpan({ cls: "mbm-jump-crumb", text: it.crumb });
      const title = row.createSpan("mbm-jump-title");
      title.setText((it.node.title || "（空）").replace(/[*_`~]/g, ""));
      row.addEventListener("click", () => {
        this.onPick(it.node);
        this.close();
      });
      row.addEventListener("mouseenter", () => {
        this.active = i;
        this.paintActive();
      });
      this.rows.push({ el: row, node: it.node });
    }
    this.paintActive();
  }

  private paintActive() {
    this.rows.forEach((r, i) => r.el.toggleClass("is-active", i === this.active));
    const cur = this.rows[this.active]?.el;
    cur?.scrollIntoView({ block: "nearest" });
  }
}

class HelpModal extends Modal {
  onOpen() {
    this.titleEl.setText("导图操作说明");
    const list = this.contentEl.createEl("ul", { cls: "mbm-tips" });
    [
      "拖动卡片：解锁后按住卡片拖动，可以把卡片挪到你喜欢的位置（子节点会跟随）。",
      "调整层级：按住 Alt 拖动卡片到目标节点上松手，即可把它变成该节点的子节点。",
      "快捷键：选中节点后 Tab 缩进一级、Shift+Tab 提升一级、Alt+↑/↓ 调整同级顺序。",
      "放大卡片：悬停卡片右上角的 ⤢ 按钮，或选中后按 Enter，整张卡片会放大显示；再用 ← ↑ ↓ → 在卡片之间穿梭。",
      "卡片里的表格 / 图片在放大视图里仍然可以点开单独看全貌，Esc 只关闭最上面那一层。",
      "内容突出：工具栏的荧光笔图标可以一键关掉所有粗体与荧光笔，方便只看结构。",
      "以上层级与位置调整都只作用于导图视图，不会改动 Markdown 原文。",
      "右键节点：折叠、移动层级、还原调整、在笔记中定位、复制分支。",
      "画布默认锁定，避免误触改动结构；点右上角锁图标即可解锁。",
      "滚轮缩放、拖动空白处平移；「+」「-」「0」快捷键缩放与适应画布。",
    ].forEach((t) => list.createEl("li", { text: t }));
  }

  onClose() {
    this.contentEl.empty();
  }
}

/* ------------------------------------------------------------------ */

export class MindmapView extends ItemView {
  plugin: MubuMindmapPlugin;
  file: TFile | null = null;
  private pendingPath: string | null = null;

  private bodyEl!: HTMLElement;
  private toolbarEl!: HTMLElement;
  private stylePanel!: HTMLElement;
  private emptyEl: HTMLElement | null = null;

  private canvas: MindmapCanvas | null = null;
  private canvasPath = "";
  private root: MindNode | null = null;
  private adjust: ViewAdjust = createAdjust();

  private fileLabel!: HTMLElement;
  private countLabel!: HTMLElement;
  private undoBtn: HTMLElement | null = null;
  private redoBtn: HTMLElement | null = null;
  private lockBtn: HTMLElement | null = null;
  private foldBtn: HTMLElement | null = null;
  private moreBtn: HTMLElement | null = null;
  private emphasisBtn: HTMLElement | null = null;

  private history = new History();
  private locked = true;
  private originText: string | null = null;
  private skipReloadUntil = 0;
  private reloadTimer = 0;
  private saveTimer = 0;
  private styleOpen = false;

  constructor(leaf: WorkspaceLeaf, plugin: MubuMindmapPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return this.file ? `${this.file.basename} · 导图` : "思维导图";
  }

  getIcon() {
    return "git-fork";
  }

  getState(): Record<string, unknown> {
    return { file: this.file?.path ?? this.pendingPath ?? null };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const s = (state ?? {}) as { file?: string | null };
    const path: string | null = s.file ?? null;
    this.pendingPath = path;
    if (path) {
      const f = this.app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) {
        await this.setFile(f);
      }
    }
    await super.setState(state, result);
  }

  /* ------------------------------------------------------------------ */
  /* 生命周期                                                            */
  /* ------------------------------------------------------------------ */

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("mbm-container");
    this.buildToolbar();
    this.bodyEl = this.contentEl.createDiv("mbm-body");
    this.buildStylePanel();
    this.registerEvents();

    if (this.pendingPath && !this.file) {
      const f = this.app.vault.getAbstractFileByPath(this.pendingPath);
      if (f instanceof TFile) await this.setFile(f);
    }
    if (!this.file) this.showEmptyState();
  }

  async onClose() {
    hideTip();
    this.canvas?.destroy();
    this.canvas = null;
    this.plugin.views.delete(this);
    this.contentEl.empty();
  }

  private registerEvents() {
    this.registerDomEvent(
      this.contentEl,
      "keydown",
      (ev: KeyboardEvent) => {
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "f") {
          ev.preventDefault();
          ev.stopPropagation();
          this.openJump();
        }
      },
      true
    );

    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        if (this.file && f.path === this.file.path) this.scheduleReload();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (f) => {
        if (this.file && f.path === this.file.path) {
          new Notice("原笔记已被删除，导图视图将保留最后一次内容");
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (f, oldPath) => {
        if (this.file && oldPath === this.file.path && f instanceof TFile) {
          this.file = f;
          this.canvasPath = "";
          void this.ensureCanvas().then(() => this.reload({ fit: false }));
          this.updateFileLabel();
        }
      })
    );
  }

  /* ------------------------------------------------------------------ */
  /* 文件                                                                */
  /* ------------------------------------------------------------------ */

  async setFile(file: TFile) {
    if (!this.bodyEl) {
      this.pendingPath = file.path;
      return;
    }
    if (this.file?.path === file.path && this.canvas) {
      await this.reload({ fit: true });
      return;
    }
    this.file = file;
    this.originText = null;
    this.history.clear();
    this.pendingPath = file.path;
    this.adjust = cloneAdjust(
      (this.plugin.settings.viewAdjust[file.path] as ViewAdjust | undefined) ??
        createAdjust()
    );
    this.updateFileLabel();
    this.hideEmptyState();
    await this.ensureCanvas();
    await this.reload({ fit: true });
    this.refreshHistoryButtons();
  }

  private async ensureCanvas() {
    if (!this.file) return;
    if (this.canvas && this.canvasPath === this.file.path) return;
    this.canvas?.destroy();
    this.canvasPath = this.file.path;
    this.canvas = new MindmapCanvas(
      this.bodyEl,
      this.app,
      this,
      this.file.path,
      () => this.plugin.settings,
      {
        onSelect: (node) => {
          if (this.plugin.settings.linkOnClick) void this.revealLine(node.line);
        },
        onToggle: (node) => void this.toggleNode(node),
        onEdit: (node, text) => void this.editNode(node, text),
        onMenu: (node, ev) => this.showNodeMenu(node, ev),
        onStrongMenu: (node, el, key, ev) => this.showStrongMenu(node, el, key, ev),
        onStructure: (op, node) => void this.applyStructure(op, node),
        onReparent: (node, target) => void this.reparent(node, target),
        onOffsetsChange: (offsets, node, prev) =>
          this.onOffsetsChange(offsets, node, prev),
        onResize: (node, size, phase) => this.handleNodeResize(node, size, phase),
        onToggleLock: () => this.toggleLock(),
        onStats: (count) => this.countLabel?.setText(`${count} 个节点`),
      }
    );
    this.canvas.setMode(this.plugin.settings.layout, false);
    this.canvas.setLocked(this.locked);
  }

  private async reload(opts: { fit?: boolean; preserveCollapse?: boolean } = {}) {
    if (!this.file || !this.canvas) return;
    const text = await this.app.vault.read(this.file);
    if (this.originText === null) this.originText = text;

    const collapsedLines = new Set<number>();
    if (opts.preserveCollapse !== false && this.root) {
      const walk = (n: MindNode) => {
        if (n.collapsed) collapsedLines.add(n.line);
        n.children.forEach(walk);
      };
      walk(this.root);
    }

    const parsed = parseMarkdown(text, this.file.basename, {
      softBreak: this.plugin.settings.softBreak,
    });

    if (collapsedLines.size) {
      const walk = (n: MindNode) => {
        if (collapsedLines.has(n.line)) n.collapsed = true;
        n.children.forEach(walk);
      };
      walk(parsed.root);
    }

    this.root = applyAdjust(parsed.root, this.adjust);

    await this.canvas.setRoot(this.root, { fit: opts.fit !== false });
    this.canvas.setOffsets(offsetsOf(this.adjust));
    this.canvas.setSizes(sizesOf(this.adjust));
    this.refreshMarks();
    if (parsed.warning) new Notice(parsed.warning);
    this.updateFileLabel();
    this.syncFoldButton();
  }

  private scheduleReload() {
    if (Date.now() < this.skipReloadUntil) return;
    if (!this.plugin.settings.autoRefresh) return;
    if (this.reloadTimer) window.clearTimeout(this.reloadTimer);
    this.reloadTimer = window.setTimeout(() => {
      this.reloadTimer = 0;
      void this.reload({ fit: false });
    }, 380);
  }

  private updateFileLabel() {
    if (this.fileLabel) this.fileLabel.setText(this.file?.basename ?? "未选择笔记");
  }

  /* ------------------------------------------------------------------ */
  /* 工具栏（纯图标 + 悬浮提示）                                          */
  /* ------------------------------------------------------------------ */

  private buildToolbar() {
    this.toolbarEl = this.contentEl.createDiv("mbm-toolbar");

    const brand = this.toolbarEl.createDiv("mbm-brand");
    const icon = brand.createSpan("mbm-brand-icon");
    setIcon(icon, "git-fork");
    this.fileLabel = brand.createSpan({ cls: "mbm-brand-text", text: "未选择笔记" });
    this.countLabel = brand.createSpan({ cls: "mbm-badge", text: "0 个节点" });

    this.toolbarEl.createDiv("mbm-spacer");

    // 视图
    const viewGroup = this.toolbarEl.createDiv("mbm-group");
    this.iconButton(viewGroup, "network", () => this.layoutTip(), (ev) =>
      this.openLayoutMenu(ev)
    );
    this.iconButton(viewGroup, "search", () => "查找并跳转节点（Ctrl/⌘ + F）", () => this.openJump());
    this.iconButton(viewGroup, "maximize", () => "适应画布", () => this.canvas?.fit(true));
    this.iconButton(
      viewGroup,
      "zoom-in",
      () => `缩放 ${Math.round((this.canvas?.getZoom() ?? 1) * 100)}%　（点开调节）`,
      (ev) => this.openZoomMenu(ev)
    );
    // 内容突出开关（粗体 / 荧光笔）：放在视图组里，离「看」的操作最近
    this.emphasisBtn = this.iconButton(
      viewGroup,
      "highlighter",
      () =>
        this.plugin.settings.emphasis
          ? "内容突出：开（粗体 + 荧光笔）· 点一下隐藏"
          : "内容突出：关 · 点一下恢复粗体与荧光笔",
      () => void this.toggleEmphasis()
    );

    // 结构 / 锁定
    const treeGroup = this.toolbarEl.createDiv("mbm-group");
    this.foldBtn = this.iconButton(
      treeGroup,
      "chevrons-down-up",
      () => (this.canvas?.hasCollapsed() ? "展开全部" : "折叠全部"),
      () => void this.toggleFoldAll()
    );
    this.lockBtn = this.iconButton(
      treeGroup,
      "lock",
      () => (this.locked ? "画布已锁定 · 点击解锁" : "画布未锁定 · 点击锁定"),
      () => this.toggleLock()
    );

    // 历史
    const editGroup = this.toolbarEl.createDiv("mbm-group");
    this.undoBtn = this.iconButton(editGroup, "undo-2", () => "撤销", () =>
      void this.undo()
    );
    this.redoBtn = this.iconButton(editGroup, "redo-2", () => "重做", () =>
      void this.redo()
    );

    // 样式 / 更多
    const miscGroup = this.toolbarEl.createDiv("mbm-group");
    this.iconButton(miscGroup, "palette", () => "样式设置", () =>
      this.toggleStylePanel()
    );
    this.moreBtn = this.iconButton(
      miscGroup,
      "more-horizontal",
      () => "更多（还原、联动、帮助）",
      (ev) => this.openMoreMenu(ev)
    );

    this.refreshHistoryButtons();
    this.syncFoldButton();
    this.syncLockButton();
    this.syncEmphasisButton();
  }

  private iconButton(
    parent: HTMLElement,
    icon: string,
    tip: () => string,
    onClick: (ev: MouseEvent) => void
  ): HTMLElement {
    const btn = parent.createEl("button", { cls: "mbm-btn mbm-btn--icon" });
    setIcon(btn.createSpan("mbm-ic"), icon);
    bindTip(btn, tip);
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onClick(ev);
    });
    return btn;
  }

  private setBtnIcon(btn: HTMLElement | null, icon: string) {
    if (!btn) return;
    const holder = btn.querySelector<HTMLElement>(".mbm-ic");
    if (!holder) return;
    holder.empty();
    setIcon(holder, icon);
  }

  private layoutTip(): string {
    const cur = this.currentMode();
    const item = LAYOUTS.find((l) => l.mode === cur);
    return `布局：${item?.label ?? "思维导图"}　（点开切换）`;
  }

  private currentMode(): LayoutMode {
    return this.canvas?.getMode() ?? this.plugin.settings.layout;
  }

  private openLayoutMenu(ev: MouseEvent) {
    const menu = new Menu();
    const cur = this.currentMode();
    for (const item of LAYOUTS) {
      menu.addItem((i) =>
        i
          .setTitle(item.label)
          .setIcon(item.icon)
          .setChecked(cur === item.mode)
          .onClick(() => this.setMode(item.mode))
      );
    }
    menu.showAtMouseEvent(ev);
  }

  private openZoomMenu(ev: MouseEvent) {
    const menu = new Menu();
    menu.addItem((i) =>
      i
        .setTitle(`当前 ${Math.round((this.canvas?.getZoom() ?? 1) * 100)}%`)
        .setDisabled(true)
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i.setTitle("放大").setIcon("zoom-in").onClick(() => this.canvas?.zoomBy(1.18))
    );
    menu.addItem((i) =>
      i.setTitle("缩小").setIcon("zoom-out").onClick(() => this.canvas?.zoomBy(0.85))
    );
    menu.addItem((i) =>
      i
        .setTitle("恢复 100%")
        .setIcon("rotate-ccw")
        .onClick(() => this.canvas?.zoomTo(1))
    );
    menu.addItem((i) =>
      i
        .setTitle("适应画布")
        .setIcon("maximize")
        .onClick(() => this.canvas?.fit(true))
    );
    menu.showAtMouseEvent(ev);
  }

  private openMoreMenu(ev: MouseEvent) {
    const stat = countAdjust(this.adjust);
    const menu = new Menu();
    menu.addItem((i) =>
      i
        .setTitle("一键还原…")
        .setIcon("rotate-ccw")
        .onClick(() => void this.resetToOriginal())
    );
    menu.addItem((i) =>
      i
        .setTitle(
          stat.total
            ? `还原视图调整（层级 ${stat.structure} / 位置 ${stat.position}）`
            : "还原视图调整"
        )
        .setIcon("eraser")
        .setDisabled(stat.total === 0)
        .onClick(() => void this.clearViewAdjust())
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("点击节点时跳到笔记位置")
        .setIcon("link")
        .setChecked(this.plugin.settings.linkOnClick)
        .onClick(async () => {
          this.plugin.settings.linkOnClick = !this.plugin.settings.linkOnClick;
          await this.plugin.saveSettings();
          new Notice(
            this.plugin.settings.linkOnClick
              ? "已开启：点击节点会跳到笔记对应位置"
              : "已关闭：点击节点只在导图内选中"
          );
        })
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i.setTitle("操作说明").setIcon("help-circle").onClick(() => new HelpModal(this.app).open())
    );
    menu.showAtMouseEvent(ev);
  }

  private setMode(mode: LayoutMode) {
    this.plugin.settings.layout = mode;
    void this.plugin.saveSettings();
    this.canvas?.setMode(mode, true);
  }

  private toggleLock() {
    this.locked = !this.locked;
    this.canvas?.setLocked(this.locked);
    this.syncLockButton();
    new Notice(
      this.locked
        ? "画布已锁定：拖动卡片与层级调整已关闭"
        : "画布已解锁：可以拖动卡片、调整层级"
    );
  }

  private syncLockButton() {
    this.setBtnIcon(this.lockBtn, this.locked ? "lock" : "unlock");
    this.lockBtn?.classList.toggle("is-active", this.locked);
  }

  private syncFoldButton() {
    const collapsed = this.canvas?.hasCollapsed() ?? false;
    this.setBtnIcon(this.foldBtn, collapsed ? "chevrons-up-down" : "chevrons-down-up");
  }

  private syncEmphasisButton() {
    this.emphasisBtn?.classList.toggle("is-active", this.plugin.settings.emphasis !== false);
  }

  /** 一键切换内容突出：关掉后粗体与荧光笔都回到普通文字 */
  private toggleEmphasis() {
    void this.plugin.toggleEmphasis();
  }

  /* ------------------------------------------------------------------ */
  /* 样式面板                                                            */
  /* ------------------------------------------------------------------ */

  private buildStylePanel() {
    this.stylePanel = this.contentEl.createDiv("mbm-style-panel");
    const head = this.stylePanel.createDiv("mbm-panel-head");
    head.createSpan({ cls: "mbm-panel-title", text: "样式设置" });
    const close = head.createEl("button", { cls: "mbm-panel-close" });
    setIcon(close, "x");
    close.addEventListener("click", () => this.toggleStylePanel(false));

    const body = this.stylePanel.createDiv("mbm-panel-body");

    this.addSlider(body, "标题字号", 13, 26, 1, () => this.plugin.settings.fontSize, (v) => {
      this.plugin.settings.fontSize = v;
    });
    this.addSlider(body, "正文字号", 10, 22, 0.5, () => this.plugin.settings.bodyFontSize, (v) => {
      this.plugin.settings.bodyFontSize = v;
    });
    this.addSlider(body, "节点最大宽度", 200, 620, 10, () => this.plugin.settings.nodeMaxWidth, (v) => {
      this.plugin.settings.nodeMaxWidth = v;
    });
    this.addSlider(body, "水平间距", 20, 140, 2, () => this.plugin.settings.gapX, (v) => {
      this.plugin.settings.gapX = v;
    });
    this.addSlider(body, "垂直间距", 6, 60, 1, () => this.plugin.settings.gapY, (v) => {
      this.plugin.settings.gapY = v;
    });
    this.addSlider(body, "连线粗细", 1, 5, 0.5, () => this.plugin.settings.lineWidth, (v) => {
      this.plugin.settings.lineWidth = v;
    });
    this.addSlider(
      body,
      "表格限高（超出滚动）",
      140,
      620,
      10,
      () => this.plugin.settings.tableMaxHeight,
      (v) => {
        this.plugin.settings.tableMaxHeight = v;
      }
    );

    this.addSegmented(
      body,
      "连线样式",
      [
        { value: "curve", label: "曲线" },
        { value: "elbow", label: "折线" },
        { value: "straight", label: "直线" },
      ],
      () => this.plugin.settings.lineStyle,
      (v) => {
        this.plugin.settings.lineStyle = v as MubuSettings["lineStyle"];
      }
    );

    this.addSegmented(
      body,
      "主题",
      [
        { value: "auto", label: "跟随" },
        { value: "light", label: "浅色" },
        { value: "dark", label: "深色" },
      ],
      () => this.plugin.settings.theme,
      (v) => {
        this.plugin.settings.theme = v as MubuSettings["theme"];
      }
    );

    this.addSegmented(
      body,
      "滚轮行为",
      [
        { value: "zoom", label: "缩放" },
        { value: "pan", label: "平移" },
      ],
      () => this.plugin.settings.wheel,
      (v) => {
        this.plugin.settings.wheel = v as MubuSettings["wheel"];
      }
    );

    this.addToggle(body, "分支彩色标记", () => this.plugin.settings.branchColors, (v) => {
      this.plugin.settings.branchColors = v;
    });
    this.addToggle(body, "显示列表序号", () => this.plugin.settings.showMarkers, (v) => {
      this.plugin.settings.showMarkers = v;
    });

    const footer = this.stylePanel.createDiv("mbm-panel-foot");
    const reset = footer.createEl("button", { text: "恢复默认样式", cls: "mbm-soft-btn" });
    reset.addEventListener("click", async () => {
      const def = DEFAULT_SETTINGS;
      Object.assign(this.plugin.settings, {
        fontSize: def.fontSize,
        bodyFontSize: def.bodyFontSize,
        nodeMaxWidth: def.nodeMaxWidth,
        gapX: def.gapX,
        gapY: def.gapY,
        lineWidth: def.lineWidth,
        lineStyle: def.lineStyle,
        branchColors: def.branchColors,
        theme: def.theme,
        showMarkers: def.showMarkers,
        tableMaxHeight: def.tableMaxHeight,
        wheel: def.wheel,
      });
      await this.plugin.saveSettings();
      this.plugin.refreshViews();
      new Notice("样式已恢复默认");
    });
  }

  private addSlider(
    parent: HTMLElement,
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void
  ) {
    const row = parent.createDiv("mbm-field");
    const head = row.createDiv("mbm-field-head");
    head.createSpan({ text: label });
    const value = head.createSpan({ cls: "mbm-field-value", text: String(get()) });
    const input = row.createEl("input", {
      cls: "mbm-range",
      attr: { type: "range", min: String(min), max: String(max), step: String(step) },
    });
    input.value = String(get());
    input.addEventListener("input", () => {
      const v = Number(input.value);
      value.setText(step >= 1 ? String(Math.round(v)) : v.toFixed(1));
      set(v);
      this.applyStyleNow();
    });
    input.addEventListener("change", () => void this.plugin.saveSettings());
  }

  private addSegmented(
    parent: HTMLElement,
    label: string,
    options: Array<{ value: string; label: string }>,
    get: () => string,
    set: (v: string) => void
  ) {
    const row = parent.createDiv("mbm-field");
    row.createDiv("mbm-field-head").createSpan({ text: label });
    const seg = row.createDiv("mbm-panel-seg");
    const buttons: HTMLElement[] = [];
    for (const opt of options) {
      const btn = seg.createEl("button", { cls: "mbm-seg-btn", text: opt.label });
      btn.addEventListener("click", () => {
        set(opt.value);
        buttons.forEach((b) => b.classList.toggle("is-active", b === btn));
        this.applyStyleNow();
        void this.plugin.saveSettings();
      });
      buttons.push(btn);
    }
    const sync = () => {
      const cur = get();
      buttons.forEach((b, i) => b.classList.toggle("is-active", options[i].value === cur));
    };
    sync();
  }

  private addToggle(
    parent: HTMLElement,
    label: string,
    get: () => boolean,
    set: (v: boolean) => void
  ) {
    const row = parent.createDiv("mbm-field mbm-field--row");
    row.createSpan({ text: label });
    const input = row.createEl("input", { cls: "mbm-check", attr: { type: "checkbox" } });
    input.checked = get();
    input.addEventListener("change", () => {
      set(input.checked);
      this.applyStyleNow();
      void this.plugin.saveSettings();
    });
  }

  private applyStyleNow() {
    if (!this.canvas) return;
    void this.canvas.refreshStyle();
  }

  private toggleStylePanel(force?: boolean) {
    this.styleOpen = force ?? !this.styleOpen;
    this.stylePanel.classList.toggle("is-open", this.styleOpen);
  }

  /* ------------------------------------------------------------------ */
  /* 历史 / 操作                                                         */
  /* ------------------------------------------------------------------ */

  private snapshot(fileUndo?: Snapshot["fileUndo"]): Snapshot {
    return {
      tree: JSON.stringify(this.root),
      mode: this.currentMode(),
      adjust: JSON.stringify(this.adjust),
      fileUndo,
    };
  }

  private pushHistory(fileUndo?: Snapshot["fileUndo"]) {
    if (!this.root) return;
    this.history.push(this.snapshot(fileUndo));
    this.refreshHistoryButtons();
  }

  private refreshHistoryButtons() {
    this.undoBtn?.classList.toggle("is-disabled", !this.history.canUndo());
    this.redoBtn?.classList.toggle("is-disabled", !this.history.canRedo());
  }

  private async applySnapshot(snap: Snapshot) {
    if (!this.canvas) return;
    if (snap.fileUndo && this.file) {
      const { line, text } = snap.fileUndo;
      this.skipReloadUntil = Date.now() + 900;
      await this.app.vault.process(this.file, (data) => {
        const lines = data.split("\n");
        if (line - 1 >= 0 && line - 1 < lines.length) lines[line - 1] = text;
        return lines.join("\n");
      });
    }
    const tree = JSON.parse(snap.tree) as MindNode;
    this.root = tree;
    this.adjust = snap.adjust ? (JSON.parse(snap.adjust) as ViewAdjust) : createAdjust();
    this.canvas.setMode(snap.mode, true);
    await this.canvas.setRoot(tree, { fit: false });
    this.canvas.setOffsets(offsetsOf(this.adjust));
    this.canvas.setSizes(sizesOf(this.adjust));
    this.refreshMarks();
    this.persistAdjust();
  }

  private async undo() {
    if (!this.history.canUndo()) return;
    const snap = this.history.undo(this.snapshot());
    if (!snap) return;
    await this.applySnapshot(snap);
    this.refreshHistoryButtons();
    new Notice("已撤销");
  }

  private async redo() {
    if (!this.history.canRedo()) return;
    const snap = this.history.redo(this.snapshot());
    if (!snap) return;
    await this.applySnapshot(snap);
    this.refreshHistoryButtons();
    new Notice("已重做");
  }

  private async toggleNode(node: MindNode) {
    if (!this.canvas) return;
    this.pushHistory();
    await this.canvas.setCollapsed(node.id, !node.collapsed, true);
    this.syncFoldButton();
  }

  private async toggleFoldAll() {
    if (!this.canvas) return;
    const collapse = !this.canvas.hasCollapsed();
    this.pushHistory();
    await this.canvas.setAllCollapsed(collapse, 1);
    this.syncFoldButton();
    new Notice(collapse ? "已折叠全部" : "已展开全部");
  }

  private async editNode(node: MindNode, text: string) {
    if (!this.file || !node.edit) return;
    const line = node.edit.line;
    const prefix = node.edit.prefixLen;
    const data = await this.app.vault.read(this.file);
    const lines = data.split("\n");
    const oldLine = lines[line - 1] ?? "";
    if (line - 1 < 0 || line - 1 >= lines.length) {
      new Notice("行号已变化，请先刷新导图");
      return;
    }
    this.pushHistory({ line, text: oldLine });
    this.skipReloadUntil = Date.now() + 900;
    await this.app.vault.process(this.file, (content) => {
      const arr = content.split("\n");
      const cur = arr[line - 1] ?? "";
      arr[line - 1] = cur.slice(0, prefix) + text;
      return arr.join("\n");
    });
    retitleAdjust(this.adjust, keyOf(node), text);
    new Notice("已同步修改到笔记");
    await this.reload({ fit: false });
  }

  /* ------------------------------------------------------------------ */
  /* 视图级调整（不动 Markdown）                                          */
  /* ------------------------------------------------------------------ */

  private refreshMarks() {
    if (!this.canvas) return;
    const structure: string[] = [];
    const position: string[] = [];
    const sized: string[] = [];
    for (const [k, adj] of Object.entries(this.adjust.nodes)) {
      if (adj.parent) structure.push(k);
      if (adj.dx !== undefined || adj.dy !== undefined) position.push(k);
      if (adj.w !== undefined || adj.h !== undefined) sized.push(k);
    }
    this.canvas.setAdjustMarks(structure, position, sized);
    this.moreBtn?.classList.toggle(
      "has-dot",
      structure.length + position.length + sized.length > 0
    );
  }

  private persistAdjust() {
    if (!this.file) return;
    this.plugin.settings.viewAdjust[this.file.path] = this.adjust;
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = 0;
      void this.plugin.saveSettings();
    }, 260);
    this.refreshMarks();
  }

  private async onOffsetsChange(
    offsets: Record<string, { dx: number; dy: number }>,
    node: MindNode,
    prev: { dx: number; dy: number }
  ) {
    const k = keyOf(node);
    // 先回到拖动前，拍下撤销快照
    setOffset(this.adjust, k, prev.dx, prev.dy, node.title);
    this.pushHistory();
    const next = offsets[k];
    setOffset(this.adjust, k, next?.dx ?? 0, next?.dy ?? 0, node.title);
    this.persistAdjust();
  }

  private handleNodeResize(
    node: MindNode,
    size: { w: number; h: number } | null,
    phase: "start" | "move" | "end"
  ) {
    const k = keyOf(node);
    if (phase === "start") {
      this.pushHistory();
      return;
    }
    if (phase === "end" && !size) {
      // 没有真正拖动：不留历史
      this.history.dropLast();
      this.refreshHistoryButtons();
      return;
    }
    if (!size) return;
    setSize(this.adjust, k, size, node.title);
    this.canvas?.setSizes(sizesOf(this.adjust));
    if (phase === "end") {
      this.persistAdjust();
      this.refreshMarks();
    }
  }

  private async applyStructure(
    op: "indent" | "outdent" | "up" | "down",
    node: MindNode
  ) {
    if (!this.root || !this.canvas) return;
    this.pushHistory();
    const ok =
      op === "indent"
        ? indentNode(this.root, node, this.adjust)
        : op === "outdent"
        ? outdentNode(this.root, node, this.adjust)
        : moveSibling(this.root, node, op === "up" ? -1 : 1, this.adjust);
    if (!ok) {
      new Notice(
        op === "indent"
          ? "已经是同级里的第一个节点，没有可以挂靠的上级"
          : op === "outdent"
          ? "已经在最外层了"
          : "已经到边了"
      );
      this.history.dropLast();
      this.refreshHistoryButtons();
      return;
    }
    await this.rerenderTree(node.id);
    this.persistAdjust();
  }

  private async reparent(node: MindNode, target: MindNode) {
    if (!this.root || !this.canvas) return;
    this.pushHistory();
    const ok = reparentTo(this.root, node, target, this.adjust);
    if (!ok) {
      new Notice("不能把节点移动到它自己的子节点下");
      this.history.dropLast();
      this.refreshHistoryButtons();
      return;
    }
    await this.rerenderTree(node.id);
    this.persistAdjust();
    new Notice(`已移动到「${target.title || "根节点"}」下（仅导图）`);
  }

  /** 结构变化后重建 DOM，并保持选中 */
  private async rerenderTree(selectedId?: string) {
    if (!this.canvas || !this.root) return;
    await this.canvas.setRoot(this.root, { fit: false });
    this.canvas.setOffsets(offsetsOf(this.adjust));
    this.canvas.setSizes(sizesOf(this.adjust));
    if (selectedId) this.canvas.setActive(selectedId, { flash: false });
    this.refreshMarks();
    this.syncFoldButton();
  }

  private async clearViewAdjust() {
    if (!this.file) return;
    this.pushHistory();
    this.adjust = createAdjust();
    await this.reload({ fit: false, preserveCollapse: true });
    this.persistAdjust();
    new Notice("已还原全部视图调整");
  }

  private resetNodeSize(node: MindNode) {
    if (!this.canvas) return;
    this.pushHistory();
    setSize(this.adjust, keyOf(node), null, node.title);
    this.canvas.setSizes(sizesOf(this.adjust));
    this.persistAdjust();
    new Notice("卡片已恢复自动大小");
  }

  private async resetNodeToSource(node: MindNode) {
    if (!this.root || !this.file) return;
    this.pushHistory();
    const changed = resetNodeAdjust(this.root, node, this.adjust);
    if (!changed) {
      new Notice("这个节点没有视图调整");
      this.history.dropLast();
      this.refreshHistoryButtons();
      return;
    }
    const pristine = await this.readPristine();
    if (!pristine) return;
    this.root = applyAdjust(pristine, this.adjust);
    await this.rerenderTree();
    this.persistAdjust();
    new Notice("已按笔记原文还原该节点");
  }

  /** 重新从磁盘解析出一棵“未做视图调整”的干净树 */
  private async readPristine(): Promise<MindNode | null> {
    if (!this.file) return null;
    const text = await this.app.vault.read(this.file);
    const parsed = parseMarkdown(text, this.file.basename, {
      softBreak: this.plugin.settings.softBreak,
    });
    return parsed.root;
  }

  /* ------------------------------------------------------------------ */
  /* 右键菜单                                                            */
  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ */
  /* 快速跳转                                                            */
  /* ------------------------------------------------------------------ */

  private collectJumpItems(): Array<{ node: MindNode; crumb: string }> {
    const out: Array<{ node: MindNode; crumb: string }> = [];
    const walk = (n: MindNode, trail: string[]) => {
      out.push({ node: n, crumb: trail.slice(-2).join(" › ") });
      for (const c of n.children) walk(c, [...trail, n.title]);
    };
    if (this.root) walk(this.root, []);
    return out;
  }

  openJump() {
    if (!this.root) {
      new Notice("还没有内容可以跳转");
      return;
    }
    new JumpModal(this.app, this.collectJumpItems(), (node) => {
      this.canvas?.revealAndSelect(node.id);
    }).open();
  }

  /* ------------------------------------------------------------------ */
  /* 单字强调：右键任意加粗片段单独设置                                    */
  /* ------------------------------------------------------------------ */

  private strongLabel(style: StrongStyle) {
    return style === "mark"
      ? "荧光笔"
      : style === "underline"
        ? "下划线"
        : style === "color"
          ? "强调色"
          : style === "bold"
            ? "仅加粗"
            : "不强调";
  }

  private showStrongMenu(_node: MindNode, _el: HTMLElement, key: string, ev: MouseEvent) {
    const path = this.file?.path ?? "";
    const cur = this.plugin.settings.strongOverrides?.[path]?.[key];
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("这一个字的显示方式").setDisabled(true));
    (["mark", "underline", "color", "bold", "none"] as StrongStyle[]).forEach((v) => {
      menu.addItem((i) =>
        i
          .setTitle(`${cur === v ? "✓ " : ""}${this.strongLabel(v)}`)
          .onClick(() => void this.setStrongOverride(key, v))
      );
    });
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("恢复这个字的默认样式")
        .setDisabled(!cur)
        .onClick(() => void this.setStrongOverride(key, null))
    );
    menu.addItem((i) =>
      i.setTitle("清空本笔记的所有单字设置").onClick(() => void this.clearStrongOverrides())
    );
    menu.showAtMouseEvent(ev);
  }

  private async setStrongOverride(key: string, style: StrongStyle | null) {
    const path = this.file?.path;
    if (!path) return;
    const all = this.plugin.settings.strongOverrides ?? {};
    this.plugin.settings.strongOverrides = all;
    const map = all[path] ?? {};
    all[path] = map;
    if (style) map[key] = style;
    else delete map[key];
    if (!Object.keys(map).length) delete all[path];
    await this.plugin.saveSettings();
    this.canvas?.paintStrongByKey(key, style);
    new Notice(style ? `已设为「${this.strongLabel(style)}」` : "已恢复默认样式");
  }

  private async clearStrongOverrides() {
    const path = this.file?.path;
    if (!path) return;
    if (this.plugin.settings.strongOverrides) {
      delete this.plugin.settings.strongOverrides[path];
    }
    await this.plugin.saveSettings();
    this.canvas?.repaintAllStrong();
    new Notice("已清空本笔记的单字强调设置");
  }

  private showNodeMenu(node: MindNode, ev: MouseEvent) {
    const menu = new Menu();
    const k = keyOf(node);
    const adj = this.adjust.nodes[k];
    const structureAdj = !!adj?.parent;
    const posAdj = adj?.dx !== undefined || adj?.dy !== undefined;

    if (this.locked) {
      menu.addItem((i) =>
        i
          .setTitle("画布已锁定 · 点此解锁后可调整")
          .setIcon("lock")
          .onClick(() => this.toggleLock())
      );
      menu.addSeparator();
    }

    menu.addItem((i) =>
      i
        .setTitle(node.collapsed ? "展开子节点" : "折叠子节点")
        .setIcon(node.collapsed ? "chevrons-up-down" : "chevrons-down-up")
        .setDisabled(!node.children.length)
        .onClick(() => void this.toggleNode(node))
    );

    menu.addItem((i) =>
      i
        .setTitle("放大查看卡片（Enter）")
        .setIcon("expand")
        .onClick(() => this.canvas?.openCardViewer(node))
    );

    menu.addSeparator();

    menu.addItem((i) =>
      i
        .setTitle("缩进一级（Tab）")
        .setIcon("indent-increase")
        .setDisabled(this.locked)
        .onClick(() => void this.applyStructure("indent", node))
    );
    menu.addItem((i) =>
      i
        .setTitle("提升一级（Shift+Tab）")
        .setIcon("indent-decrease")
        .setDisabled(this.locked)
        .onClick(() => void this.applyStructure("outdent", node))
    );
    menu.addItem((i) =>
      i
        .setTitle("上移（Alt+↑）")
        .setIcon("arrow-up")
        .setDisabled(this.locked)
        .onClick(() => void this.applyStructure("up", node))
    );
    menu.addItem((i) =>
      i
        .setTitle("下移（Alt+↓）")
        .setIcon("arrow-down")
        .setDisabled(this.locked)
        .onClick(() => void this.applyStructure("down", node))
    );
    menu.addItem((i) =>
      i
        .setTitle("移动到指定节点下…")
        .setIcon("git-branch-plus")
        .setDisabled(this.locked)
        .onClick(() => this.openPicker(node))
    );

    const sizeAdj = adj?.w !== undefined || adj?.h !== undefined;
    if (sizeAdj) {
      menu.addItem((i) =>
        i
          .setTitle("恢复卡片自动大小")
          .setIcon("maximize")
          .setDisabled(this.locked)
          .onClick(() => this.resetNodeSize(node))
      );
    }

    if (structureAdj || posAdj) {
      menu.addItem((i) =>
        i
          .setTitle("还原该节点（回到原文层级/位置）")
          .setIcon("eraser")
          .onClick(() => void this.resetNodeToSource(node))
      );
    }

    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("在笔记中定位")
        .setIcon("crosshair")
        .onClick(() => void this.revealLine(node.line))
    );
    menu.addItem((i) =>
      i
        .setTitle("复制节点文本")
        .setIcon("copy")
        .onClick(async () => {
          await navigator.clipboard.writeText(node.title);
          new Notice("已复制");
        })
    );
    menu.addItem((i) =>
      i
        .setTitle("复制整个分支")
        .setIcon("clipboard-list")
        .onClick(async () => {
          await navigator.clipboard.writeText(branchToMarkdown(node, 0));
          new Notice("已复制分支 Markdown");
        })
    );

    menu.showAtMouseEvent(ev);
  }

  private openPicker(node: MindNode) {
    if (!this.root) return;
    new NodePickerModal(this.app, node, this.root, (target) => {
      void this.reparent(node, target);
    }).open();
  }

  /* ------------------------------------------------------------------ */
  /* 一键还原                                                            */
  /* ------------------------------------------------------------------ */

  private async resetToOriginal() {
    if (!this.file) return;
    const file = this.file;

    const reloadView = async () => {
      this.pushHistory();
      this.adjust = createAdjust();
      await this.reload({ fit: true, preserveCollapse: false });
      this.persistAdjust();
      new Notice("导图已按笔记原文重新生成");
    };

    let current = "";
    try {
      current = await this.app.vault.read(file);
    } catch {
      return;
    }

    const restoreOriginal = async () => {
      if (this.originText === null) return;
      this.pushHistory();
      this.skipReloadUntil = Date.now() + 1000;
      await this.app.vault.modify(file, this.originText);
      this.adjust = createAdjust();
      await this.reload({ fit: true, preserveCollapse: false });
      this.persistAdjust();
      new Notice("已恢复为打开导图时的内容");
    };

    if (this.originText !== null && this.originText !== current) {
      new ActionModal(
        this.app,
        "一键还原",
        "「仅重置导图」会丢弃折叠、卡片位置、层级调整等视图状态，但不动你的文字；「恢复原始内容」还会把笔记正文改回打开导图时的样子，期间在编辑器里做的修改会一并撤销。",
        [
          { label: "仅重置导图", run: () => void reloadView() },
          {
            label: "恢复原始内容",
            warning: true,
            run: () => void restoreOriginal(),
          },
        ]
      ).open();
    } else {
      await reloadView();
    }
  }

  /* ------------------------------------------------------------------ */
  /* 与 Markdown 联动（手动）                                            */
  /* ------------------------------------------------------------------ */

  async revealLine(line: number) {
    if (!this.file) return;
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    let target: WorkspaceLeaf | null = null;
    for (const leaf of leaves) {
      const v = leaf.view;
      if (v instanceof MarkdownView && v.file?.path === this.file.path) {
        target = leaf;
        break;
      }
    }
    if (!target) {
      const leaf = this.app.workspace.getLeaf("split", "vertical");
      await leaf.openFile(this.file);
      target = leaf;
    }
    const md = target.view as MarkdownView;
    if (!md?.editor) return;
    const pos = { line: Math.max(0, line - 1), ch: 0 };
    md.editor.setCursor(pos);
    md.editor.scrollIntoView({ from: pos, to: pos }, true);
    this.app.workspace.setActiveLeaf(target, { focus: true });
    md.editor.focus();
  }

  /* ------------------------------------------------------------------ */
  /* 空状态 / 设置变化                                                   */
  /* ------------------------------------------------------------------ */

  private showEmptyState() {
    if (this.emptyEl) return;
    this.emptyEl = this.bodyEl.createDiv("mbm-empty");
    const icon = this.emptyEl.createDiv("mbm-empty-icon");
    setIcon(icon, "git-fork");
    this.emptyEl.createEl("h3", { text: "还没有选择笔记" });
    this.emptyEl.createEl("p", {
      text: "打开一篇 Markdown 笔记，然后点击右上角的分支图标，或使用命令面板「打开当前笔记的思维导图」。",
    });
  }

  private hideEmptyState() {
    this.emptyEl?.remove();
    this.emptyEl = null;
  }

  /** 供命令调用：按屏翻页（PageDown / PageUp 同效） */
  panPage(dir: 1 | -1) {
    this.canvas?.panPage(dir);
  }

  fitCanvas() {
    this.canvas?.fit(true);
  }

  onSettingsChanged() {
    this.canvas?.applyStyleVars();
    if (this.canvas) void this.canvas.refreshStyle();
    this.canvas?.setLocked(this.locked);
    this.syncLockButton();
    this.syncFoldButton();
    this.syncEmphasisButton();
    this.updateFileLabel();
  }
}

/* ------------------------------------------------------------------ */

function branchToMarkdown(node: MindNode, level: number): string {
  const pad = "  ".repeat(level);
  const line = `${pad}- ${node.title}`;
  const kids = node.children.map((c) => branchToMarkdown(c, level + 1));
  return [line, ...kids].join("\n");
}
