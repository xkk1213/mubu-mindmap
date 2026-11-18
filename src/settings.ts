import { App, PluginSettingTab, Setting } from "obsidian";
import type MubuMindmapPlugin from "./main";
import { LayoutMode, MubuSettings } from "./types";

export class MubuSettingTab extends PluginSettingTab {
  plugin: MubuMindmapPlugin;

  constructor(app: App, plugin: MubuMindmapPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("mbm-settings");
    containerEl.createEl("h2", { text: "Mubu Mindmap 设置" });

    new Setting(containerEl)
      .setName("默认布局")
      .setDesc("新打开的导图默认使用的形态，也可以在导图工具栏里随时切换。")
      .addDropdown((d) =>
        d
          .addOption("mindmap", "思维导图（左右展开）")
          .addOption("right", "向右逻辑图")
          .addOption("left", "向左逻辑图")
          .addOption("down", "向下大纲图")
          .setValue(this.plugin.settings.layout)
          .onChange(async (v) => {
            this.plugin.settings.layout = v as LayoutMode;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(containerEl)
      .setName("软换行处理")
      .setDesc(
        "一个条目里换行书写时的处理方式：「保留换行」按你写的行数原样显示（推荐，幕布效果）；「合并成段」则拼成一段。"
      )
      .addDropdown((d) =>
        d
          .addOption("break", "保留换行（推荐）")
          .addOption("merge", "合并成一段")
          .setValue(this.plugin.settings.softBreak)
          .onChange(async (v) => {
            this.plugin.settings.softBreak = v as "break" | "merge";
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(containerEl)
      .setName("滚轮行为")
      .setDesc(
        "默认「滚轮平移」最贴合触控板：两指上下滑就上下移动，Shift + 滚轮横向移动，Ctrl / Cmd + 滚轮（捏合）才是缩放。想换成滚轮缩放也可以在这里改。"
      )
      .addDropdown((d) =>
        d
          .addOption("pan", "滚轮平移（推荐，触控板友好）")
          .addOption("zoom", "滚轮缩放")
          .setValue(this.plugin.settings.wheel)
          .onChange(async (v) => {
            this.plugin.settings.wheel = v as "zoom" | "pan";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("点击节点跳转到笔记")
      .setDesc(
        "默认关闭：点击节点只在导图里选中，不会打断你在笔记中的阅读与编辑。需要时可在导图右上角「更多」菜单里临时打开。"
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.linkOnClick).onChange(async (v) => {
          this.plugin.settings.linkOnClick = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("粗体强调样式")
      .setDesc(
        "中文常用字体只有常规 / 加粗两档，标题本身已接近加粗，纯靠字重看不出 **粗体**。所有样式都只改视觉、不改排版，切换「内容突出」前后文字位置完全不变。"
      )
      .addDropdown((d) =>
        d
          .addOption("mark", "荧光笔底色（按层级：标题下划线）")
          .addOption("markall", "荧光笔底色（所有层级都用底色）")
          .addOption("color", "强调色")
          .addOption("underline", "下划线")
          .addOption("bold", "仅加粗")
          .setValue(this.plugin.settings.strongStyle)
          .onChange(async (v) => {
            this.plugin.settings.strongStyle = v as MubuSettings["strongStyle"];
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(containerEl)
      .setName("内容突出（粗体 / 荧光笔）")
      .setDesc(
        "打开后笔记里的 **粗体** 会以荧光笔或强调色显示；关掉后导图回到纯文字，只保留结构。导图工具栏的荧光笔图标可以随时一键切换。"
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.emphasis !== false).onChange(async (v) => {
          this.plugin.settings.emphasis = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        })
      );

    new Setting(containerEl)
      .setName("节点内表格")
      .setDesc(
        "限高滚动：卡片不会被长表格撑高，点表格右上角或底部提示可放大看全貌。完整展开：表格全部铺开。"
      )
      .addDropdown((d) =>
        d
          .addOption("limit", "限高滚动 + 点击放大")
          .addOption("full", "完整展开")
          .setValue(this.plugin.settings.tableMode)
          .onChange(async (v) => {
            this.plugin.settings.tableMode = v as MubuSettings["tableMode"];
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(containerEl)
      .setName("表格最大高度")
      .setDesc("「限高滚动」模式下表格的显示高度，超出后内部滚动（表头吸顶）。")
      .addSlider((sl) =>
        sl
          .setLimits(140, 620, 10)
          .setValue(this.plugin.settings.tableMaxHeight)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.tableMaxHeight = v;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(containerEl)
      .setName("自动同步笔记修改")
      .setDesc("在编辑器中改动笔记后，导图会自动刷新（保留折叠状态与视图位置）。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoRefresh).onChange(async (v) => {
          this.plugin.settings.autoRefresh = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("在 Markdown 视图显示入口按钮")
      .setDesc("在笔记右上角工具栏添加一个分支图标，点击即可在右侧打开思维导图。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.headerButton).onChange(async (v) => {
          this.plugin.settings.headerButton = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
          this.app.workspace.trigger("layout-change");
        })
      );

    containerEl.createEl("h3", { text: "使用提示" });
    const tips = containerEl.createEl("ul", { cls: "mbm-tips" });
    [
      "笔记里的标题（#）、无序列表（-）、数字列表（1.）会自动变成树状结构。",
      "列表项下面的正文、表格、代码块、引用、图片都会完整显示在节点里。",
      "解锁画布后可以拖动卡片；按住 Alt 拖动卡片到另一个节点上，即可改层级。",
      "选中节点后用 Tab / Shift+Tab 缩进或提升，Alt+↑/↓ 调整同级顺序。",
      "层级与卡片位置调整只影响导图视图，不会改动 Markdown 原文。",
      "双击节点可以修改标题，改动会写回 Markdown 原文。",
      "右键节点可以折叠子树、还原调整、在笔记中定位、复制分支 Markdown。",
      "误操作后可用工具栏的撤销 / 重做，或用「一键还原」回到打开导图时的内容。",
    ].forEach((t) => tips.createEl("li", { text: t }));
  }
}
