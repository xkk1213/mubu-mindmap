/**
 * Markdown -> 幕布式大纲树
 *
 * 设计要点：
 * 1. 标题 (#) 与列表 (-, 1.) 统一成同一棵树；
 * 2. 列表项下的续行、段落、表格、代码、图片、引用全部挂到该节点的正文块里，
 *    因此导图不会“只显示标题”，正文内容 100% 保留；
 * 3. 不严格换行（lazy continuation）默认保留为多行显示；
 * 4. 保留每行在源码中的位置，实现 md <-> 导图双向定位与标题回写。
 */

import {
  ContentBlock,
  EditRange,
  MindNode,
  ParseOptions,
  ParseResult,
} from "./types";

const HEADING_RE = /^( {0,3})(#{1,6})([ \t]+)(.*)$/;
const LIST_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)([\s\S]*)$/;
const TASK_RE = /^\[([ xX])\]([ \t]+)([\s\S]*)$/;
const HR_RE =
  /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const FENCE_RE = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`]*)[ \t]*$/;
const QUOTE_RE = /^[ \t]*>[ \t]?(.*)$/;
const TABLE_RE = /^[ \t]*\|/;
const IMG_ONLY_RE =
  /^!\[\[[^\]]+\]\]$|^!\[[^\]]*\]\([^)]*\)$/;
const MATH_FENCE_RE = /^[ \t]*\$\$[ \t]*$/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function indentWidth(ws: string): number {
  let w = 0;
  for (const ch of ws) w += ch === "\t" ? 4 : 1;
  return w;
}

export function parseMarkdown(
  text: string,
  fileName: string,
  options: ParseOptions = {}
): ParseResult {
  return new Parser(text, fileName, options).parse();
}

class Parser {
  private lines: string[];
  /** 因为剥离 frontmatter 造成的行号偏移 */
  private offset = 0;
  private root: MindNode;
  private headingStack: MindNode[] = [];
  private listStack: Array<{ indent: number; node: MindNode }> = [];
  private current: MindNode;
  private currentHeading: MindNode;
  private para: string[] = [];
  private paraLine = 0;
  private lastBlank = true;
  private idc = 0;
  private softBreak: "break" | "merge";
  private count = 0;

  constructor(text: string, fileName: string, options: ParseOptions) {
    let source = text.replace(/\r\n?/g, "\n");
    let title = fileName.replace(/\.md$/i, "").trim() || "笔记";

    const fm = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(source);
    if (fm) {
      const m = /^title:\s*(.+)$/m.exec(fm[1]);
      if (m) {
        const t = m[1].trim().replace(/^["']|["']$/g, "").trim();
        if (t) title = t;
      }
      const removed = fm[0].split("\n").length - 1;
      this.offset = removed;
      source = source.slice(fm[0].length);
    }

    this.lines = source.split("\n");
    this.softBreak = options.softBreak ?? "break";

    this.root = {
      id: "n0",
      kind: "root",
      title,
      marker: "",
      checked: null,
      blocks: [],
      children: [],
      line: 1,
      endLine: 1,
      collapsed: false,
      edit: null,
      depth: 0,
    };
    this.current = this.root;
    this.currentHeading = this.root;
  }

  private lineNo(index: number): number {
    return index + 1 + this.offset;
  }

  parse(): ParseResult {
    const lines = this.lines;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw.trim()) {
        this.flushParagraph();
        this.lastBlank = true;
        continue;
      }

      // ---- 代码块 ----
      const fence = FENCE_RE.exec(raw);
      if (fence) {
        this.flushParagraph();
        this.dedentContainer(raw);
        const start = i;
        const body: string[] = [raw.replace(/[ \t]+$/, "")];
        const closeRe = new RegExp(
          "^[ \\t]*" + escapeRe(fence[2][0]) + "{" + fence[2].length + ",}[ \\t]*$"
        );
        let j = i + 1;
        for (; j < lines.length; j++) {
          body.push(lines[j]);
          if (closeRe.test(lines[j])) break;
        }
        i = Math.min(j, lines.length - 1);
        this.attach({
          kind: "code",
          md: body.join("\n"),
          line: this.lineNo(start),
          lang: fence[3] ?? "",
        });
        this.lastBlank = false;
        continue;
      }

      // ---- 数学块 ----
      if (MATH_FENCE_RE.test(raw)) {
        this.flushParagraph();
        this.dedentContainer(raw);
        const start = i;
        const body: string[] = ["$$"];
        let j = i + 1;
        for (; j < lines.length; j++) {
          body.push(lines[j]);
          if (MATH_FENCE_RE.test(lines[j])) break;
        }
        i = Math.min(j, lines.length - 1);
        this.attach({
          kind: "math",
          md: body.join("\n"),
          line: this.lineNo(start),
        });
        this.lastBlank = false;
        continue;
      }

      // ---- 表格 ----
      if (TABLE_RE.test(raw)) {
        this.flushParagraph();
        this.dedentContainer(raw);
        const start = i;
        const body: string[] = [raw];
        while (i + 1 < lines.length && TABLE_RE.test(lines[i + 1])) {
          body.push(lines[++i]);
        }
        this.attach({
          kind: "table",
          md: body.join("\n"),
          line: this.lineNo(start),
        });
        this.lastBlank = false;
        continue;
      }

      // ---- 引用 / Callout ----
      if (QUOTE_RE.test(raw)) {
        this.flushParagraph();
        this.dedentContainer(raw);
        const start = i;
        const body: string[] = [raw];
        while (i + 1 < lines.length && QUOTE_RE.test(lines[i + 1])) {
          body.push(lines[++i]);
        }
        this.attach({
          kind: "quote",
          md: body.join("\n"),
          line: this.lineNo(start),
        });
        this.lastBlank = false;
        continue;
      }

      // ---- 分隔线（必须早于列表判断，避免 --- 被当成列表） ----
      if (HR_RE.test(raw)) {
        this.flushParagraph();
        this.dedentContainer(raw);
        this.attach({ kind: "hr", md: "---", line: this.lineNo(i) });
        this.lastBlank = false;
        continue;
      }

      // ---- 标题 ----
      const h = HEADING_RE.exec(raw);
      if (h) {
        this.flushParagraph();
        const level = h[2].length;
        let title = (h[4] ?? "").trim();
        // 去掉结尾的 ### 修饰
        title = title.replace(/[ \t]+#+[ \t]*$/, "").trim();
        const titleStart = h[1].length + level + h[3].length;

        // 按“栈顶标题级别 >= 当前级别”弹栈：文档从 ## 开始时也不会错误嵌套
        while (
          this.headingStack.length &&
          (this.headingStack[this.headingStack.length - 1].level ?? 0) >= level
        ) {
          this.headingStack.pop();
        }
        const parent =
          this.headingStack[this.headingStack.length - 1] ?? this.root;
        const node = this.addNode(parent, "heading", title, this.lineNo(i), {
          edit: { line: this.lineNo(i), prefixLen: titleStart },
        });
        node.level = level;
        this.headingStack.push(node);
        this.listStack = [];
        this.current = node;
        this.currentHeading = node;
        this.lastBlank = false;
        continue;
      }

      // ---- 列表项 ----
      const l = LIST_RE.exec(raw);
      if (l) {
        this.flushParagraph();
        const indent = indentWidth(l[1]);
        let content = l[4];
        let checked: boolean | null = null;
        let markerText = l[2];

        const task = TASK_RE.exec(content);
        if (task) {
          checked = task[1].toLowerCase() === "x";
          content = task[3];
          markerText = checked ? "☑" : "☐";
        } else if (/^\d/.test(l[2])) {
          markerText = l[2].replace(/[)]$/, ".");
        } else {
          markerText = "•";
        }

        const contentStart = raw.length - content.length;

        while (
          this.listStack.length &&
          this.listStack[this.listStack.length - 1].indent >= indent
        ) {
          this.listStack.pop();
        }
        const parent = this.listStack.length
          ? this.listStack[this.listStack.length - 1].node
          : this.currentHeading;

        const node = this.addNode(parent, "item", content.trim(), this.lineNo(i), {
          marker: markerText,
          checked,
          edit: { line: this.lineNo(i), prefixLen: contentStart },
        });
        this.listStack.push({ indent, node });
        this.current = node;
        this.lastBlank = false;
        continue;
      }

      // ---- 正文段落 ----
      if (!this.para.length) {
        this.dedentContainer(raw);
        this.paraLine = i;
      }

      const trimmed = raw.trim();
      if (IMG_ONLY_RE.test(trimmed)) {
        this.flushParagraph();
        this.attach({
          kind: "img",
          md: trimmed,
          line: this.lineNo(i),
        });
      } else {
        this.para.push(trimmed);
      }
      this.lastBlank = false;
    }

    this.flushParagraph();

    // 单 H1 作为文档标题时提升为根（只提升一级）
    let root = this.root;
    if (
      root.children.length === 1 &&
      root.children[0].kind === "heading" &&
      root.children[0].level === 1 &&
      root.blocks.length === 0
    ) {
      const child = root.children[0];
      child.kind = "root";
      child.edit = null;
      root = child;
    }
    this.reindex(root, 0);
    this.finalize(root);
    this.count = 0;
    this.countNodes(root);

    const result: ParseResult = { root, nodeCount: this.count };
    if (this.count > 1200) {
      result.warning = `当前笔记解析出 ${this.count} 个节点，渲染可能需要一点时间。`;
    }
    this.root = root;
    return result;
  }

  private addNode(
    parent: MindNode,
    kind: "heading" | "item",
    title: string,
    line: number,
    extra: { marker?: string; checked?: boolean | null; edit?: EditRange | null }
  ): MindNode {
    const node: MindNode = {
      id: "n" + ++this.idc,
      kind,
      title,
      marker: extra.marker ?? "",
      checked: extra.checked ?? null,
      blocks: [],
      children: [],
      line,
      endLine: line,
      collapsed: false,
      edit: extra.edit ?? null,
      depth: parent.depth + 1,
    };
    parent.children.push(node);
    return node;
  }

  private attach(block: ContentBlock) {
    this.current.blocks.push(block);
  }

  /** 空行之后，若块级元素缩进不大于列表项，则回到上层容器（保持 Markdown 语义） */
  private dedentContainer(lineStr: string) {
    if (!this.lastBlank || !this.listStack.length) return;
    const indent = indentWidth(/^[ \t]*/.exec(lineStr)?.[0] ?? "");
    while (
      this.listStack.length &&
      indent <= this.listStack[this.listStack.length - 1].indent
    ) {
      this.listStack.pop();
    }
    const top = this.listStack[this.listStack.length - 1];
    this.current = top ? top.node : this.currentHeading;
  }

  private flushParagraph() {
    if (!this.para.length) return;
    const joiner = this.softBreak === "break" ? "  \n" : " ";
    const md = this.para.join(joiner);
    this.para = [];
    if (!md.trim()) return;
    this.attach({ kind: "p", md, line: this.paraLine + 1 + this.offset });
  }

  private reindex(node: MindNode, depth: number) {
    node.depth = depth;
    for (const c of node.children) this.reindex(c, depth + 1);
  }

  private finalize(node: MindNode): number {
    let end = node.line;
    for (const b of node.blocks) end = Math.max(end, b.line);
    for (const c of node.children) {
      end = Math.max(end, this.finalize(c));
    }
    node.endLine = end;
    return end;
  }

  private countNodes(node: MindNode) {
    this.count++;
    for (const c of node.children) this.countNodes(c);
  }
}

/** 浅拷贝整棵树（用于撤销快照 / 状态恢复） */
export function cloneTree(node: MindNode): MindNode {
  return JSON.parse(JSON.stringify(node)) as MindNode;
}

/** 找到光标所在行对应的最深节点 */
export function findNodeForLine(
  root: MindNode,
  line: number
): { node: MindNode; path: MindNode[] } | null {
  let best: { node: MindNode; path: MindNode[] } | null = null;

  const walk = (node: MindNode, path: MindNode[]) => {
    const next = [...path, node];
    if (line >= node.line && line <= node.endLine) {
      const better =
        !best ||
        node.depth > best.node.depth ||
        (node.depth === best.node.depth && node.line === line);
      if (better) best = { node, path: next };
      for (const c of node.children) walk(c, next);
    }
  };
  walk(root, []);
  return best;
}
