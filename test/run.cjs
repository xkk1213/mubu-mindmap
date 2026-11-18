const assert = require("assert");
const { parseMarkdown, findNodeForLine } = require("./parser.cjs");
const { computeLayout } = require("./layout.cjs");

const SAMPLE = `---
title: 项目计划
---

开场白第一行
第二行懒续行

## 背景

- 现状
  这是现状的补充说明
  第二条补充

  | 指标 | 数值 |
  | --- | --- |
  | 用户 | 100 |

- 目标
  1. 提升转化
  2. 降低成本
     - 使用缓存
     - 使用 CDN

> 引用一句话

\`\`\`js
console.log(1);
\`\`\`

![截图](img.png)

### 详细方案
- **加粗重点**：这里是很长的一段正文，用来测试换行与显示。
- 普通条目
`;

const res = parseMarkdown(SAMPLE, "demo", { softBreak: "break" });
const root = res.root;

function dump(n, ind = 0) {
  const pad = "  ".repeat(ind);
  console.log(`${pad}${n.kind === "root" ? "[ROOT]" : n.marker} ${n.title}  (L${n.line}-${n.endLine}) blocks=${n.blocks.map((b) => b.kind).join(",")}`);
  n.children.forEach((c) => dump(c, ind + 1));
}
dump(root);

// --- 结构 ---
assert.strictEqual(root.title, "项目计划", "frontmatter title 应作为根标题");
assert.strictEqual(root.children.length, 1, "应只有一个一级章节");
const bg = root.children[0];
assert.strictEqual(bg.title, "背景");
assert.strictEqual(root.blocks.length, 1, "根节点应保留开头正文");
assert.ok(root.blocks[0].md.includes("第二行懒续行"), "懒续行必须保留");
assert.ok(root.blocks[0].md.includes("\n"), "默认应保留换行");

const titles = bg.children.map((c) => c.title);
console.log("背景的子节点:", titles);
assert.deepStrictEqual(titles, ["现状", "目标", "详细方案"]);

const xianzhuang = bg.children[0];
assert.ok(
  xianzhuang.blocks.some((b) => b.kind === "table"),
  "表格必须保留在节点正文里"
);
assert.ok(
  xianzhuang.blocks.some((b) => b.kind === "p" && b.md.includes("补充说明")),
  "多行正文必须保留"
);

const mubiao = bg.children[1];
assert.strictEqual(mubiao.children.length, 2);
assert.strictEqual(mubiao.children[0].marker, "1.");
assert.strictEqual(mubiao.children[1].children.length, 2, "三级列表应嵌套");

// 引用 / 代码 / 图片：空行后应从深层列表回退到标题层级
const allNodes = [];
(function walk(n) {
  allNodes.push(n);
  n.children.forEach(walk);
})(root);
const withQuote = allNodes.filter((n) => n.blocks.some((b) => b.kind === "quote"));
assert.strictEqual(withQuote.length, 1, "引用块应挂在标题节点，而不是最深的列表项");
assert.ok(
  allNodes.some((n) => n.blocks.some((b) => b.kind === "code")),
  "代码块必须保留"
);
assert.ok(
  allNodes.some((n) => n.blocks.some((b) => b.kind === "img")),
  "图片必须保留"
);

// 加粗原样保留（由 Obsidian 渲染器负责）
assert.ok(
  allNodes.some((n) => n.title.includes("**加粗重点**")),
  "行内加粗语法需保留给渲染器"
);

// --- 行号映射 ---
const lineOfGoal = bg.children[1].line;
const hit = findNodeForLine(root, lineOfGoal);
assert.strictEqual(hit.node.title, "目标", "行号应映射到对应节点");

// --- 布局 ---
const sizes = new Map();
allNodes.forEach((n) => sizes.set(n.id, { w: Math.min(340, 80 + n.title.length * 14), h: 60 }));
for (const mode of ["mindmap", "right", "left", "down"]) {
  const layout = computeLayout(root, sizes, { mode, gapX: 58, gapY: 20 });
  assert.ok(layout.nodes.length === allNodes.length, mode + " 节点数应一致");
  assert.ok(layout.edges.length === allNodes.length - 1, mode + " 边数应为 n-1");
  assert.ok(layout.width > 0 && layout.height > 0, mode + " 尺寸应有效");
  // 每个节点都不重叠
  for (let i = 0; i < layout.nodes.length; i++) {
    for (let j = i + 1; j < layout.nodes.length; j++) {
      const a = layout.nodes[i];
      const b = layout.nodes[j];
      const overlap =
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `${mode}: 节点 ${a.node.title} 与 ${b.node.title} 重叠`);
    }
  }
  // 边必须都指向真实存在的节点
  for (const e of layout.edges) {
    assert.ok(layout.byId.get(e.from.id), "边起点应存在");
    assert.ok(layout.byId.get(e.to.id), "边终点应存在");
  }
  console.log(
    `${mode}: ${layout.nodes.length} 节点, ${layout.edges.length} 连线, ${Math.round(layout.width)}x${Math.round(layout.height)}`
  );
}

// --- 折叠后布局 ---
const collapsed = JSON.parse(JSON.stringify(root));
collapsed.children[0].children[1].collapsed = true;
const l2 = computeLayout(collapsed, sizes, { mode: "mindmap", gapX: 58, gapY: 20 });
assert.ok(l2.nodes.length < allNodes.length, "折叠后节点应变少");
assert.ok(l2.nodes.every((n) => sizes.has(n.id)), "折叠后仍应有尺寸");

// --- 纯列表文档（无标题） ---
const plain = parseMarkdown("- a\n  - a1\n  - a2\n- b\n", "list", {});
assert.strictEqual(plain.root.children.length, 2);
assert.strictEqual(plain.root.children[0].children.length, 2);

// --- 数字列表 + 任务列表 ---
const tasks = parseMarkdown("1. 第一\n2. 第二\n   - [x] 完成项\n   - [ ] 未完成\n", "t", {});
assert.strictEqual(tasks.root.children.length, 2);
assert.strictEqual(tasks.root.children[1].children[0].checked, true);
assert.strictEqual(tasks.root.children[1].children[1].checked, false);

// --- 单 H1 提升为根 ---
const h1 = parseMarkdown("# 唯一标题\n\n## 小节\n- x\n", "f", {});
assert.strictEqual(h1.root.title, "唯一标题");
assert.strictEqual(h1.root.kind, "root");

console.log("\n✅ 全部解析与布局测试通过");
