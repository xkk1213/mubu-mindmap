"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/parser.ts
var parser_exports = {};
__export(parser_exports, {
  cloneTree: () => cloneTree,
  findNodeForLine: () => findNodeForLine,
  parseMarkdown: () => parseMarkdown
});
module.exports = __toCommonJS(parser_exports);
var HEADING_RE = /^( {0,3})(#{1,6})([ \t]+)(.*)$/;
var LIST_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)([\s\S]*)$/;
var TASK_RE = /^\[([ xX])\]([ \t]+)([\s\S]*)$/;
var HR_RE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
var FENCE_RE = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`]*)[ \t]*$/;
var QUOTE_RE = /^[ \t]*>[ \t]?(.*)$/;
var TABLE_RE = /^[ \t]*\|/;
var IMG_ONLY_RE = /^!\[\[[^\]]+\]\]$|^!\[[^\]]*\]\([^)]*\)$/;
var MATH_FENCE_RE = /^[ \t]*\$\$[ \t]*$/;
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function indentWidth(ws) {
  let w = 0;
  for (const ch of ws)
    w += ch === "	" ? 4 : 1;
  return w;
}
function parseMarkdown(text, fileName, options = {}) {
  return new Parser(text, fileName, options).parse();
}
var Parser = class {
  constructor(text, fileName, options) {
    /** 因为剥离 frontmatter 造成的行号偏移 */
    this.offset = 0;
    this.headingStack = [];
    this.listStack = [];
    this.para = [];
    this.paraLine = 0;
    this.lastBlank = true;
    this.idc = 0;
    this.count = 0;
    let source = text.replace(/\r\n?/g, "\n");
    let title = fileName.replace(/\.md$/i, "").trim() || "\u7B14\u8BB0";
    const fm = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(source);
    if (fm) {
      const m = /^title:\s*(.+)$/m.exec(fm[1]);
      if (m) {
        const t = m[1].trim().replace(/^["']|["']$/g, "").trim();
        if (t)
          title = t;
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
      depth: 0
    };
    this.current = this.root;
    this.currentHeading = this.root;
  }
  lineNo(index) {
    return index + 1 + this.offset;
  }
  parse() {
    const lines = this.lines;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw.trim()) {
        this.flushParagraph();
        this.lastBlank = true;
        continue;
      }
      const fence = FENCE_RE.exec(raw);
      if (fence) {
        this.flushParagraph();
        this.dedentContainer(raw);
        const start = i;
        const body = [raw.replace(/[ \t]+$/, "")];
        const closeRe = new RegExp(
          "^[ \\t]*" + escapeRe(fence[2][0]) + "{" + fence[2].length + ",}[ \\t]*$"
        );
        let j = i + 1;
        for (; j < lines.length; j++) {
          body.push(lines[j]);
          if (closeRe.test(lines[j]))
            break;
        }
        i = Math.min(j, lines.length - 1);
        this.attach({
          kind: "code",
          md: body.join("\n"),
          line: this.lineNo(start),
          lang: fence[3] ?? ""
        });
        this.lastBlank = false;
        continue;
      }
      if (MATH_FENCE_RE.test(raw)) {
        this.flushParagraph();
        this.dedentContainer(raw);
        const start = i;
        const body = ["$$"];
        let j = i + 1;
        for (; j < lines.length; j++) {
          body.push(lines[j]);
          if (MATH_FENCE_RE.test(lines[j]))
            break;
        }
        i = Math.min(j, lines.length - 1);
        this.attach({
          kind: "math",
          md: body.join("\n"),
          line: this.lineNo(start)
        });
        this.lastBlank = false;
        continue;
      }
      if (TABLE_RE.test(raw)) {
        this.flushParagraph();
        this.dedentContainer(raw);
        const start = i;
        const body = [raw];
        while (i + 1 < lines.length && TABLE_RE.test(lines[i + 1])) {
          body.push(lines[++i]);
        }
        this.attach({
          kind: "table",
          md: body.join("\n"),
          line: this.lineNo(start)
        });
        this.lastBlank = false;
        continue;
      }
      if (QUOTE_RE.test(raw)) {
        this.flushParagraph();
        this.dedentContainer(raw);
        const start = i;
        const body = [raw];
        while (i + 1 < lines.length && QUOTE_RE.test(lines[i + 1])) {
          body.push(lines[++i]);
        }
        this.attach({
          kind: "quote",
          md: body.join("\n"),
          line: this.lineNo(start)
        });
        this.lastBlank = false;
        continue;
      }
      if (HR_RE.test(raw)) {
        this.flushParagraph();
        this.dedentContainer(raw);
        this.attach({ kind: "hr", md: "---", line: this.lineNo(i) });
        this.lastBlank = false;
        continue;
      }
      const h = HEADING_RE.exec(raw);
      if (h) {
        this.flushParagraph();
        const level = h[2].length;
        let title = (h[4] ?? "").trim();
        title = title.replace(/[ \t]+#+[ \t]*$/, "").trim();
        const titleStart = h[1].length + level + h[3].length;
        while (this.headingStack.length && (this.headingStack[this.headingStack.length - 1].level ?? 0) >= level) {
          this.headingStack.pop();
        }
        const parent = this.headingStack[this.headingStack.length - 1] ?? this.root;
        const node = this.addNode(parent, "heading", title, this.lineNo(i), {
          edit: { line: this.lineNo(i), prefixLen: titleStart }
        });
        node.level = level;
        this.headingStack.push(node);
        this.listStack = [];
        this.current = node;
        this.currentHeading = node;
        this.lastBlank = false;
        continue;
      }
      const l = LIST_RE.exec(raw);
      if (l) {
        this.flushParagraph();
        const indent = indentWidth(l[1]);
        let content = l[4];
        let checked = null;
        let markerText = l[2];
        const task = TASK_RE.exec(content);
        if (task) {
          checked = task[1].toLowerCase() === "x";
          content = task[3];
          markerText = checked ? "\u2611" : "\u2610";
        } else if (/^\d/.test(l[2])) {
          markerText = l[2].replace(/[)]$/, ".");
        } else {
          markerText = "\u2022";
        }
        const contentStart = raw.length - content.length;
        while (this.listStack.length && this.listStack[this.listStack.length - 1].indent >= indent) {
          this.listStack.pop();
        }
        const parent = this.listStack.length ? this.listStack[this.listStack.length - 1].node : this.currentHeading;
        const node = this.addNode(parent, "item", content.trim(), this.lineNo(i), {
          marker: markerText,
          checked,
          edit: { line: this.lineNo(i), prefixLen: contentStart }
        });
        this.listStack.push({ indent, node });
        this.current = node;
        this.lastBlank = false;
        continue;
      }
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
          line: this.lineNo(i)
        });
      } else {
        this.para.push(trimmed);
      }
      this.lastBlank = false;
    }
    this.flushParagraph();
    let root = this.root;
    if (root.children.length === 1 && root.children[0].kind === "heading" && root.children[0].level === 1 && root.blocks.length === 0) {
      const child = root.children[0];
      child.kind = "root";
      child.edit = null;
      root = child;
    }
    this.reindex(root, 0);
    this.finalize(root);
    this.count = 0;
    this.countNodes(root);
    const result = { root, nodeCount: this.count };
    if (this.count > 1200) {
      result.warning = `\u5F53\u524D\u7B14\u8BB0\u89E3\u6790\u51FA ${this.count} \u4E2A\u8282\u70B9\uFF0C\u6E32\u67D3\u53EF\u80FD\u9700\u8981\u4E00\u70B9\u65F6\u95F4\u3002`;
    }
    this.root = root;
    return result;
  }
  addNode(parent, kind, title, line, extra) {
    const node = {
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
      depth: parent.depth + 1
    };
    parent.children.push(node);
    return node;
  }
  attach(block) {
    this.current.blocks.push(block);
  }
  /** 空行之后，若块级元素缩进不大于列表项，则回到上层容器（保持 Markdown 语义） */
  dedentContainer(lineStr) {
    if (!this.lastBlank || !this.listStack.length)
      return;
    const indent = indentWidth(/^[ \t]*/.exec(lineStr)?.[0] ?? "");
    while (this.listStack.length && indent <= this.listStack[this.listStack.length - 1].indent) {
      this.listStack.pop();
    }
    const top = this.listStack[this.listStack.length - 1];
    this.current = top ? top.node : this.currentHeading;
  }
  flushParagraph() {
    if (!this.para.length)
      return;
    const joiner = this.softBreak === "break" ? "  \n" : " ";
    const md = this.para.join(joiner);
    this.para = [];
    if (!md.trim())
      return;
    this.attach({ kind: "p", md, line: this.paraLine + 1 + this.offset });
  }
  reindex(node, depth) {
    node.depth = depth;
    for (const c of node.children)
      this.reindex(c, depth + 1);
  }
  finalize(node) {
    let end = node.line;
    for (const b of node.blocks)
      end = Math.max(end, b.line);
    for (const c of node.children) {
      end = Math.max(end, this.finalize(c));
    }
    node.endLine = end;
    return end;
  }
  countNodes(node) {
    this.count++;
    for (const c of node.children)
      this.countNodes(c);
  }
};
function cloneTree(node) {
  return JSON.parse(JSON.stringify(node));
}
function findNodeForLine(root, line) {
  let best = null;
  const walk = (node, path) => {
    const next = [...path, node];
    if (line >= node.line && line <= node.endLine) {
      const better = !best || node.depth > best.node.depth || node.depth === best.node.depth && node.line === line;
      if (better)
        best = { node, path: next };
      for (const c of node.children)
        walk(c, next);
    }
  };
  walk(root, []);
  return best;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cloneTree,
  findNodeForLine,
  parseMarkdown
});
