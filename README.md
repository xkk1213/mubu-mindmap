# Mubu Mindmap

Turn a Markdown note into a **Mubu-style mind map** inside Obsidian: headings and lists become a tree automatically, and paragraphs, tables, images and code blocks are all rendered inside the nodes — nothing is truncated.

- **Full Markdown support** — bold, italics, inline code, links, math, ordered / unordered / task lists and multi-line bodies, rendered with Obsidian's own renderer.
- **Editable structure, untouched source** — hold `Alt` and drop a card onto another node, or indent / promote with `Tab` / `Shift+Tab`. The Markdown file itself is never rewritten.
- **Highlight layer** — `**bold**` text gets a highlighter / underline treatment layered by depth. Toggle the whole layer from the toolbar; text positions stay **pixel-identical** either way, so you can flip between the two states without losing your visual memory of the map.
- **Per-word styling** — right-click any bold run to override the highlight style for that word only.
- **Zoom everywhere** — cards, tables and images each open into a full-screen viewer with wheel zoom, drag-to-pan, and `←` `↑` `↓` `→` to jump between neighbouring cards.
- **Comfort** — resizable and freely movable cards, four layouts, search and jump (`Ctrl/⌘ + F`), edge scrollbar, keyboard panning, undo / redo, light and dark themes.

## Install

1. In Obsidian, open **Settings → Community plugins → Browse** and search for **Mubu Mindmap**.
2. Enable **Mubu Mindmap** in **Settings → Community plugins**.

Manual install: copy `main.js`, `manifest.json` and `styles.css` into `<your vault>/.obsidian/plugins/mubu-mindmap/`.

## Usage

Click the branch icon in the left ribbon (or the button in the note header, or run the command `Open mind map of current note`) to open the map beside your note. The canvas is **locked by default** so you can pan, zoom and select without moving anything; unlock it from the toolbar to drag cards or change structure. Right-click a node for the full menu, and press `Ctrl/⌘ + F` to jump to any item by title or body text.

---

## 中文说明

把 Obsidian 里的 Markdown 一键变成**幕布式思维导图**：标题、列表自动成树，正文、表格、图片、代码全部完整显示；支持卡片拖动与缩放、**不改原文的层级调整**、卡片 / 表格 / 图片点开放大、强调一键开关、撤销 / 一键还原。

## ✨ 特性

| 需求 | 实现 |
| --- | --- |
| 无缝转换 | `#` 标题、`-` 无序列表、`1.` 数字列表、`- [ ]` 任务列表自动组成一棵树，无需任何标记 |
| 完美兼容语法 | 节点内用 Obsidian 官方渲染器渲染 `**加粗**`、*斜体*、`行内代码`、链接、`$公式$`；数字序号原样保留 |
| 内容全显示 | 列表项下的多行正文、表格、代码块、引用（Callout）、图片全部显示在节点里，绝不截断 |
| 软换行 | 「保留换行」模式按你写的行数原样显示（可在设置中改为合并成段） |
| 多媒体 | 图片按节点宽度自适应缩放；表格**限高滚动 + 表头吸顶**，长表格不再把卡片撑成面条；代码块可滚动 |
| 放大查看 | **表格 / 图片 / 整张卡片**都能点开整屏放大：滚轮缩放、拖动平移、双击复位、一键「适应」，12 行 5 列的表格也能看全貌 |
| 卡片穿梭 | 卡片放大后用 `←` `↑` `↓` `→` 按方位跳到相邻卡片，`‹` `›` 按文档顺序前后翻；卡片里的表格、图片仍可再点开一层 |
| 粗体强调 | `**粗体**` 用**荧光笔底色 + 微描边**标出，像马克笔划过；第 1、2 层大字标题用浅一档的底色，不会糊成一片 |
| 强调可开关 | 工具栏荧光笔图标一键切换「内容突出」：关掉后荧光笔全部隐藏，只剩纯文字；**切换前后文字位置一个像素都不动**，方便对照记忆 |
| 单字可调 | **右键任意一段加粗文字**，单独把这一处设成荧光笔 / 下划线 / 强调色 / 仅加粗 / 不强调，精确到一个词 |
| 卡片大小可调 | 解锁后拖卡片右下角手柄，长宽随意拖；超出的内容在卡片内滚动，不会丢 |
| UI 视觉 | 大字号（默认 16px 可调）、高对比浅色/深色双主题、分支彩色标记、合理的默认间距（均可调） |
| 丝滑交互 | 布局切换 240ms 缓动动画；连线在独立 SVG 图层统一重绘，永不消失；图片加载完成自动重新布局 |
| 卡片自由摆放 | 解锁后直接拖动卡片，拖到哪就停在哪；移动父节点时子树跟随，连线实时跟随 |
| 层级可调（不动原文） | 把某个条目挂到别的节点下 / 缩进 / 提升 / 调顺序，**只改导图，不改 Markdown** |
| 轻量工具栏 | 纯图标 + 悬浮提示，布局与缩放收进菜单，展开/折叠合成一个按钮，强调开关就放在视图组里 |

## 📦 安装

1. 打开你的库目录：`你的库/.obsidian/plugins/`
2. 把整个 `mubu-mindmap` 文件夹复制进去（只需 3 个文件：`main.js`、`manifest.json`、`styles.css`）
3. 重启 Obsidian → 设置 → 第三方插件 → 启用 **Mubu Mindmap**

## 🚀 使用

- 点击左侧边栏的 **分支图标**，或笔记右上角的 **分支按钮**，或命令面板 `打开当前笔记的思维导图`（右侧分屏 / 新标签页）
- **单击节点**：只在导图里选中，不会打断你的笔记编辑
- **双击节点标题**：直接修改并写回 Markdown 原文（需解锁）
- **单击节点右侧的 −/+ 圆点**：折叠 / 展开子树（折叠时显示 `+N` 数量）
- **右键节点**：折叠、缩进/提升/上移/下移、移动到指定节点、还原该节点、在笔记中定位、复制分支
- **滚轮**：缩放（可在设置改为平移）；**Ctrl+滚轮**：缩放；**Shift+滚轮**：横向平移；拖动空白处平移
- 快捷键：`+` / `-` 缩放，`0` 适应画布；选中节点后 `Tab` 缩进、`Shift+Tab` 提升、`Alt+↑/↓` 调顺序

### 画布默认是锁定的

默认锁定，避免看导图时误拖误改：

- 锁定时：可以缩放、平移、折叠/展开、选中节点；**不能**拖动卡片、改层级、双击改标题
- 解锁：点工具栏的锁图标，或点左下角「已锁定 · 点击解锁」徽标，或右键节点选「点此解锁」

### 卡片自由摆放

解锁后按住卡片拖动即可移动位置（子节点跟随）。做过位置调整的卡片右上角有一个小圆点；右键「还原该节点」可回到自动布局的位置。

### 调整卡片大小

解锁后把鼠标移到卡片右下角，会出现一个斜纹手柄，按住拖动即可改宽高（140–920px 宽、44–1500px 高）。内容超出时卡片内部滚动；改过尺寸的卡片是蓝色虚线边框，右键 →「恢复卡片自动大小」可还原。尺寸同样只存在导图视图里，不改 Markdown。

### 放大查看（卡片 / 表格 / 图片）

- **整张卡片**：鼠标移到卡片右上角的 ⤢ 按钮上点一下，或选中节点后按 `Enter`，或右键 →「放大查看卡片」。卡片会以更大的字号、更宽的行宽铺满屏幕，长文读起来像一页文档
- **卡片之间穿梭**：`←` `↑` `↓` `→` 按屏幕方位跳到相邻卡片（左边那张、下边那张…），顶部 `‹` `›` 按文档顺序前后翻；标题栏会显示「第 N / 共 M 个节点」
- **卡片里的表格 / 图片**：在放大视图里直接点表格或图片，会在上面再叠一层单独放大；`Esc` 只关最上面那一层，先回卡片、再回导图
- **表格**：卡片右上角有放大图标（悬停出现），底部还有一条「共 N 行 × M 列 · 点击放大看全貌」提示，点任意一处都会打开整屏浮层
- **图片**：直接点图片即放大
- 浮层里：滚轮缩放、按住拖动平移、双击复位、`Esc` 关闭；顶部可见当前百分比，还有「适应 / 1:1」按钮
- 若想让表格在卡片里直接铺开，设置 →「节点内表格」改成「完整展开」

### 单字强调：精确到每一个词

默认按层级分工：中心主题与一级标题用下划线（不挡阅读），三级以下的列表与正文用荧光笔。

想单独改某一个词（比如某个列表项里的重点想改成下划线）：

- **右键那段加粗文字** → 选「荧光笔 / 下划线 / 强调色 / 仅加粗 / 不强调」
- 只影响这一个词，其他位置照旧；设置按「笔记 + 所在行 + 第几处」记录，改了正文也不会串位
- 菜单里还有「恢复这个字的默认样式」和「清空本笔记的所有单字设置」
- 鼠标悬停时加粗词会出现一圈虚线，提示这里可以右键

### 触控板 / 滚动

- **滚轮默认平移**（老版本是缩放，第一次打开会自动迁移过来）：两指上下滑 = 上下移动，左右滑 = 水平移动，捏合（Ctrl / Cmd + 滚轮）= 缩放
- **右边缘滚动条**：拖动滑块上下移动，点空白轨道直接跳到那个位置
- **键盘**：`↑` `↓` `←` `→` 平移（`Shift` 加速），`PageUp` / `PageDown` 整屏翻页，`Home` 回到中心主题
- 想改回滚轮缩放：设置 →「滚轮行为」

### 快速跳到某个条目（几种方案）

- **搜索跳转（推荐）**：`Ctrl / ⌘ + F`，或点工具栏放大镜；输入标题或正文关键词，`↑` `↓` 选，`Enter` 直接飞过去并高亮。结果行会显示所属分支，跳到被折叠的节点时会自动展开
- **命令面板**：`Ctrl / ⌘ + P` 搜「查找并跳转到节点」，可以顺手绑个快捷键
- **`Home`**：任何时候回到中心主题
- **折叠 + 视口**：先「折叠全部」，再按分支展开，配合滚动条快速定位
- **大纲式浏览**：把笔记标题层级收干净（只留 H2/H3），导图本身就成了可点击的目录

### 内容突出：一键开关

工具栏视图组里的**荧光笔图标**控制整张导图的强调显示：

- 开着（高亮状态）：`**粗体**` 显示为**荧光笔底色**（第 1、2 层大字用浅一档的底色），并带一点点描边让字更实
- 点一下关掉：荧光笔、描边一起撤掉，回到纯文字
- **位置绝对不变**：强调只用「颜色 / 底色 / 描边 / 下划线」这类不占布局的属性，不改字重、不改字距、不加内边距。所以开关切换时每一行、每张卡片的位置都一模一样，可以直接来回对照
- 强调样式可在 设置 → Mubu Mindmap →「粗体强调样式」切换：荧光笔底色（默认）/ 下划线 / 强调色 / 仅加粗，四种都不影响排版
- 命令面板搜索「切换内容突出」可以给它绑一个顺手的快捷键

### 改层级但不改原文

三种方式，都只影响导图视图，Markdown 一个字都不动：

1. **按住 Alt 拖动**卡片到目标节点上松手 → 成为它的子节点（目标节点会显示蓝色虚线框）
2. **右键菜单**：缩进一级 / 提升一级 / 上移 / 下移 / 移动到指定节点下…（带搜索的节点选择器）
3. **快捷键**：选中节点后 `Tab`、`Shift+Tab`、`Alt+↑/↓`

被手动改过层级的卡片显示蓝色虚线边框；工具栏「更多」按钮上会出现一个小蓝点，点开可一键「还原视图调整」。这些调整按文件保存在插件数据里，重新打开导图仍然生效；笔记内容改动导致行号漂移时会自动丢弃对不上的调整，不会张冠李戴。

### 工具栏（纯图标，悬停看名称）

```
文件名 节点数 | 布局▾ · 搜索跳转 · 适应画布 · 缩放▾ · 强调开关 | 折叠/展开 · 锁定 | 撤销 重做 | 样式 · 更多⋯
```

- **布局▾**：思维导图（左右）/ 向右 / 向左 / 向下，菜单里带勾选状态
- **缩放▾**：显示当前百分比，可放大 / 缩小 / 恢复 100% / 适应画布
- **折叠/展开**：一个按钮自动切换（有折叠时显示"展开全部"）
- **强调开关**：一键显示 / 隐藏荧光笔，改前后文字位置不变
- **更多⋯**：一键还原、还原视图调整、点击节点跳转笔记（默认关）、操作说明

### 与笔记联动

默认**不联动**：点节点只选中，在笔记里移动光标也不会打断阅读。需要时：

- 右键节点 →「在笔记中定位」
- 或「更多⋯」→ 打开「点击节点时跳到笔记位置」

### 样式设置面板

标题字号、正文字号、节点最大宽度、水平/垂直间距、连线粗细、表格限高、连线样式（曲线/折线/直线）、主题（跟随/浅色/深色）、滚轮行为、分支彩色标记、显示列表序号，并可一键恢复默认。

表格还有两种显示方式：「限高滚动 + 点击放大」（默认，卡片不被撑高）或「完整展开」（表格全铺开）。

## ⚙️ 全局设置

设置 → Mubu Mindmap：默认布局、软换行处理、滚轮行为、点击节点跳转笔记、**粗体强调样式**、**内容突出开关**、**节点内表格显示方式**、表格最大高度、自动同步笔记修改、是否显示入口按钮。

## 🛠️ 开发

```bash
npm install
npm run dev      # watch 模式
npm run build    # 类型检查 + 生产打包
node test/run.cjs  # 解析/布局自动化测试
```

`test/` 目录包含一个浏览器预览环境（mock Obsidian API + Playwright 截图），可在不启动 Obsidian 的情况下视觉验证渲染效果。

## 📝 已知说明

- 根节点标题来自文件名或 frontmatter `title`，双击根节点会提示直接改名
- 单个 `#` 一级标题会自动作为导图根节点（文档大纲型笔记的常见写法）
- 超过 1200 个节点时会提示渲染可能稍慢（实测 961 节点约 110ms 完成渲染）
- 表格超过「表格最大高度」后内部滚动，可横向拖动查看右侧列；想一眼看全就点表格放大
- 图片上按住拖动不会移动卡片（那是「点一下放大」的热区），拖卡片请按在标题或空白处
- 卡片放大视图里改不了内容：它只是一张「放大镜」，改文字请双击卡片标题，改层级请在导图里拖动
