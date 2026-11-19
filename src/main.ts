import { MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { MubuSettingTab } from "./settings";
import { DEFAULT_SETTINGS, LayoutMode, MubuSettings } from "./types";
import { MindmapView, VIEW_TYPE } from "./view";

const LAYOUT_ORDER: LayoutMode[] = ["mindmap", "right", "left", "down"];
const LAYOUT_NAME: Record<LayoutMode, string> = {
  mindmap: "思维导图",
  right: "向右逻辑图",
  left: "向左逻辑图",
  down: "向下大纲图",
};

export default class MubuMindmapPlugin extends Plugin {
  settings: MubuSettings = { ...DEFAULT_SETTINGS };
  views = new Set<MindmapView>();

  private actionEls: HTMLElement[] = [];
  private decorated = new WeakSet<MarkdownView>();

  async onload() {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => {
      const view = new MindmapView(leaf, this);
      this.views.add(view);
      return view;
    });

    this.addRibbonIcon("git-fork", "打开思维导图", () => void this.openActive("split"));

    this.addCommand({
      id: "open-mindmap-split",
      name: "打开当前笔记的思维导图（右侧分屏）",
      callback: () => void this.openActive("split"),
    });
    this.addCommand({
      id: "open-mindmap-tab",
      name: "打开当前笔记的思维导图（新标签页）",
      callback: () => void this.openActive("tab"),
    });
    this.addCommand({
      id: "cycle-layout",
      name: "切换导图布局",
      callback: () => void this.cycleLayout(),
    });
    this.addCommand({
      id: "fit-canvas",
      name: "适应画布",
      callback: () => {
        void this.withActiveView((v) => v.fitCanvas());
      },
    });
    this.addCommand({
      id: "jump-to-node",
      name: "查找并跳转到节点",
      callback: () => {
        void this.withActiveView((v) => v.openJump());
      },
    });
    this.addCommand({
      id: "scroll-down",
      name: "导图向下滚动",
      callback: () => {
        void this.withActiveView((v) => v.panPage?.(1));
      },
    });
    this.addCommand({
      id: "scroll-up",
      name: "导图向上滚动",
      callback: () => {
        void this.withActiveView((v) => v.panPage?.(-1));
      },
    });
    this.addCommand({
      id: "toggle-emphasis",
      name: "切换内容突出（粗体 / 荧光笔）",
      callback: () => void this.toggleEmphasis(),
    });

    this.addSettingTab(new MubuSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => this.refreshHeaderButtons());
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.refreshHeaderButtons())
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.refreshHeaderButtons())
    );
    this.registerEvent(
      this.app.workspace.on("css-change", () => this.refreshViews())
    );
  }

  onunload() {
    this.actionEls.forEach((el) => el.remove());
    this.actionEls = [];
    // 注意：不要在这里 detachLeavesOfType，否则用户把导图拖到别处后，
    // 重新加载插件时 leaf 会被重置回默认位置（社区审查明确要求避免）。
    this.views.clear();
  }

  /* ------------------------------------------------------------------ */

  private async withActiveView(fn: (view: MindmapView) => void | Promise<void>) {
    const file = this.app.workspace.getActiveFile();
    let target: MindmapView | null = null;
    for (const view of this.views) {
      if (file && view.file?.path === file.path) target = view;
    }
    if (!target) {
      new Notice("请先打开该笔记的思维导图");
      return;
    }
    await fn(target);
  }

  async openActive(mode: "split" | "tab" = "split") {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new Notice("请先打开一篇 Markdown 笔记");
      return;
    }
    await this.openForFile(file, mode);
  }

  async openForFile(file: TFile, mode: "split" | "tab" = "split") {
    const open = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    for (const view of this.views) {
      if (view.file?.path === file.path && open.includes(view.leaf)) {
        void this.app.workspace.revealLeaf(view.leaf);
        return;
      }
    }
    const leaf =
      mode === "tab"
        ? this.app.workspace.getLeaf("tab")
        : this.app.workspace.getLeaf("split", "vertical");
    await leaf.setViewState({
      type: VIEW_TYPE,
      active: true,
      state: { file: file.path },
    });
    void this.app.workspace.revealLeaf(leaf);
  }

  private refreshHeaderButtons() {
    if (!this.settings.headerButton) {
      if (this.actionEls.length) {
        this.actionEls.forEach((el) => el.remove());
        this.actionEls = [];
        this.decorated = new WeakSet<MarkdownView>();
      }
      return;
    }
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || !view.file) continue;
      if (this.decorated.has(view)) continue;
      this.decorated.add(view);
      const el = view.addAction("git-fork", "打开思维导图", () => {
        if (view.file) void this.openForFile(view.file, "split");
      });
      this.actionEls.push(el);
    }
  }

  /* ------------------------------------------------------------------ */

  private async cycleLayout() {
    const cur = this.settings.layout;
    const next = LAYOUT_ORDER[(LAYOUT_ORDER.indexOf(cur) + 1) % LAYOUT_ORDER.length];
    this.settings.layout = next;
    await this.saveSettings();
    this.refreshViews();
    new Notice(`布局：${LAYOUT_NAME[next]}`);
  }

  refreshViews() {
    for (const view of this.views) view.onSettingsChanged();
  }

  /** 一键显示 / 隐藏所有粗体与荧光笔强调 */
  async toggleEmphasis() {
    const next = this.settings.emphasis === false;
    this.settings.emphasis = next;
    await this.saveSettings();
    this.refreshViews();
    new Notice(
      next ? "已恢复内容突出（粗体 + 荧光笔）" : "已隐藏所有粗体与荧光笔，只留纯文字"
    );
  }

  /* ------------------------------------------------------------------ */

  async loadSettings() {
    const data = (await this.loadData()) as Partial<MubuSettings> | null;
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      { viewAdjust: {}, strongOverrides: {} },
      data ?? {}
    ) as MubuSettings;
    // 老版本默认「滚轮 = 缩放」，触控板上下滑动会误缩放；这里迁移一次成「滚动」
    if (!this.settings.wheelMigrated) {
      this.settings.wheel = "pan";
      this.settings.wheelMigrated = true;
      await this.saveSettings();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
