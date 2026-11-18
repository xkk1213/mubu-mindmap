/**
 * 数据模型：Markdown -> 树
 */

export type NodeKind = "root" | "heading" | "item";

export type BlockKind =
  | "p"
  | "table"
  | "code"
  | "quote"
  | "hr"
  | "img"
  | "math";

/** 节点内部的“正文块”（段落 / 表格 / 代码 / 引用 / 图片…） */
export interface ContentBlock {
  kind: BlockKind;
  /** 原始 markdown，交给 Obsidian 渲染器处理 */
  md: string;
  /** 1-based 源码行号 */
  line: number;
  lang?: string;
}

/** 标题在源码中的位置，用于双向编辑回写 */
export interface EditRange {
  /** 1-based 行号 */
  line: number;
  /** 该行中标题文本的起始列（0-based，按原始字符计） */
  prefixLen: number;
}

export interface MindNode {
  id: string;
  kind: NodeKind;
  /** 标题 inline markdown，例如 “**重点** 内容” */
  title: string;
  /** 列表标记：1. / • / ☑ … */
  marker: string;
  /** 任务列表勾选状态，null 表示不是任务项 */
  checked: boolean | null;
  /** 正文块，全部渲染，保证“内容全显示” */
  blocks: ContentBlock[];
  children: MindNode[];
  /** 起始行（1-based） */
  line: number;
  /** 结束行（1-based，含所有子节点与正文） */
  endLine: number;
  /** 标题级别（仅 heading 有效，1-6） */
  level?: number;
  collapsed: boolean;
  edit: EditRange | null;
  depth: number;
}

export interface ParseOptions {
  /** break: 软换行保留为多行；merge: 软换行合并为一行 */
  softBreak?: "break" | "merge";
}

export interface ParseResult {
  root: MindNode;
  nodeCount: number;
  /** 节点过多等提示 */
  warning?: string;
}

export type LayoutMode = "mindmap" | "right" | "left" | "down";

export interface MubuSettings {
  layout: LayoutMode;
  fontSize: number;
  bodyFontSize: number;
  nodeMaxWidth: number;
  gapX: number;
  gapY: number;
  lineStyle: "curve" | "elbow" | "straight";
  lineWidth: number;
  branchColors: boolean;
  theme: "auto" | "light" | "dark";
  showMarkers: boolean;
  /** 粗体强调样式：荧光笔 / 强化色 / 仅加粗 */
  strongStyle: "mark" | "markall" | "color" | "bold" | "underline";
  /** 内容突出总开关：关掉后所有粗体与荧光笔都不显示，正文回到朴素排版 */
  emphasis: boolean;
  /** 节点内表格：限高滚动 / 完整展开 */
  tableMode: "limit" | "full";
  softBreak: "break" | "merge";
  wheel: "zoom" | "pan";
  /** 点击节点时是否同步跳转到笔记（默认关，需要时手动打开） */
  linkOnClick: boolean;
  autoRefresh: boolean;
  headerButton: boolean;
  /** 表格最大高度，超出后内部滚动，避免节点被撑得过高 */
  tableMaxHeight: number;
  /** 每个文件的视图级调整（层级 / 顺序 / 卡片位置），按文件路径存放 */
  viewAdjust: Record<string, unknown>;
  /** 单字强调覆盖：文件路径 -> 「行号|序号|文字」-> mark / underline / color / bold / none */
  strongOverrides: Record<string, Record<string, string>>;
  /** 滚轮默认行为是否已经迁移过一次（老版本默认是缩放） */
  wheelMigrated?: boolean;
}

export const DEFAULT_SETTINGS: MubuSettings = {
  layout: "mindmap",
  fontSize: 16,
  bodyFontSize: 13.5,
  nodeMaxWidth: 340,
  gapX: 58,
  gapY: 20,
  lineStyle: "curve",
  lineWidth: 2.5,
  branchColors: true,
  theme: "auto",
  showMarkers: true,
  strongStyle: "mark",
  emphasis: true,
  tableMode: "limit",
  softBreak: "break",
  wheel: "pan",
  linkOnClick: false,
  autoRefresh: true,
  headerButton: true,
  tableMaxHeight: 300,
  viewAdjust: {},
  strongOverrides: {},
};
