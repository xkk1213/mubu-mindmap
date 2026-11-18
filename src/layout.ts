/**
 * 布局引擎：为四种形态计算节点坐标
 *  - mindmap: 根居中，分支左右展开（幕布 / XMind 经典形态）
 *  - right  : 向右的逻辑图
 *  - left   : 向左的逻辑图
 *  - down   : 向下的大纲图（组织架构式）
 *
 * 使用“按深度对齐列 + 子树高度居中对齐”的 tidy-tree 变体，
 * 保证节点间距均匀、切换布局时结果可预测。
 */

import { LayoutMode, MindNode } from "./types";

export interface Size {
  w: number;
  h: number;
}

export interface PlacedNode {
  id: string;
  node: MindNode;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  side: 1 | -1;
  branch: number;
  parent: PlacedNode | null;
  children: PlacedNode[];
}

export interface LayoutEdge {
  from: PlacedNode;
  to: PlacedNode;
}

export interface LayoutResult {
  root: PlacedNode;
  nodes: PlacedNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  byId: Map<string, PlacedNode>;
}

interface T {
  node: MindNode;
  id: string;
  w: number;
  h: number;
  depth: number;
  side: 1 | -1;
  branch: number;
  parent: T | null;
  children: T[];
  subH: number;
  subW: number;
  x: number;
  y: number;
}

export interface LayoutOptions {
  mode: LayoutMode;
  gapX: number;
  gapY: number;
}

export function computeLayout(
  root: MindNode,
  sizes: Map<string, Size>,
  opts: LayoutOptions
): LayoutResult {
  const { mode, gapX, gapY } = opts;
  const rootT = buildTree(root, sizes, null, 0, 1, 0);

  if (mode === "down") {
    layoutDown(rootT, gapX, gapY);
  } else if (mode === "right") {
    layoutHorizontal(rootT, gapX, gapY, new Set());
  } else if (mode === "left") {
    layoutHorizontal(rootT, gapX, gapY, new Set(), true);
  } else {
    // mindmap: 按“高度均衡”的方式把根的子节点分配到左右两侧
    const split = splitIndex(rootT.children);
    const leftSet = new Set<T>();
    rootT.children.forEach((c, i) => {
      if (i >= split) markSubtree(c, leftSet, -1);
    });
    layoutHorizontal(rootT, gapX, gapY, leftSet);
  }

  return normalize(rootT);
}

function markSubtree(t: T, set: Set<T>, side: 1 | -1) {
  t.side = side;
  set.add(t);
  for (const c of t.children) markSubtree(c, set, side);
}

function buildTree(
  node: MindNode,
  sizes: Map<string, Size>,
  parent: T | null,
  depth: number,
  side: 1 | -1,
  branch: number
): T {
  const size = sizes.get(node.id) ?? { w: 200, h: 42 };
  const t: T = {
    node,
    id: node.id,
    w: Math.max(60, size.w),
    h: Math.max(24, size.h),
    depth,
    side,
    branch,
    parent,
    children: [],
    subH: 0,
    subW: 0,
    x: 0,
    y: 0,
  };
  if (!node.collapsed) {
    node.children.forEach((child, i) => {
      t.children.push(
        buildTree(
          child,
          sizes,
          t,
          depth + 1,
          1,
          depth === 0 ? i : branch
        )
      );
    });
  }
  return t;
}

/** 在不考虑间距的估算下找到左右两侧高度最接近的切分点 */
function splitIndex(children: T[]): number {
  const n = children.length;
  if (n <= 1) return n;
  const weights = children.map((c) => estimateHeight(c));
  const total = weights.reduce((a, b) => a + b, 0);
  let best = 1;
  let bestDiff = Infinity;
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    acc += weights[i];
    const diff = Math.abs(acc - (total - acc));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i + 1;
    }
  }
  return best;
}

function estimateHeight(t: T): number {
  if (!t.children.length) return t.h + 20;
  return Math.max(
    t.h + 20,
    t.children.reduce((sum, c) => sum + estimateHeight(c), 0)
  );
}

function computeSubH(t: T, gapY: number): number {
  if (!t.children.length) {
    t.subH = t.h;
    return t.subH;
  }
  let sum = 0;
  for (const c of t.children) sum += computeSubH(c, gapY);
  sum += gapY * (t.children.length - 1);
  t.subH = Math.max(t.h, sum);
  return t.subH;
}

function computeSubW(t: T, gapX: number): number {
  if (!t.children.length) {
    t.subW = t.w;
    return t.subW;
  }
  let sum = 0;
  for (const c of t.children) sum += computeSubW(c, gapX);
  sum += gapX * (t.children.length - 1);
  t.subW = Math.max(t.w, sum);
  return t.subW;
}

/** 左右方向的布局 */
function layoutHorizontal(
  root: T,
  gapX: number,
  gapY: number,
  leftSet: Set<T>,
  forceLeft = false
) {
  const sides: Array<1 | -1> = [1, -1];
  const colW = new Map<number, number[]>();

  const collectCols = (t: T, side: 1 | -1) => {
    if (t.depth > 0) {
      const arr = colW.get(side) ?? [];
      arr[t.depth] = Math.max(arr[t.depth] ?? 0, t.w);
      colW.set(side, arr);
    }
    for (const c of t.children) collectCols(c, t.side === -1 ? -1 : 1);
  };

  for (const c of root.children) {
    if (forceLeft) markSubtree(c, leftSet, -1);
    c.side = leftSet.has(c) ? -1 : 1;
    collectCols(c, c.side);
    computeSubH(c, gapY);
  }

  const offsetFor = (side: 1 | -1, depth: number): number => {
    const arr = colW.get(side) ?? [];
    let off = gapX;
    for (let d = 1; d < depth; d++) off += (arr[d] ?? 0) + gapX;
    return off;
  };

  root.x = 0;
  root.y = 0;
  const centerY = root.h / 2;

  const place = (t: T, top: number) => {
    t.y = top + (t.subH - t.h) / 2;
    const off = offsetFor(t.side, t.depth);
    t.x = t.side === 1 ? root.w + off : -off - t.w;
    let cursor = top;
    for (const c of t.children) {
      c.side = t.side;
      place(c, cursor);
      cursor += c.subH + gapY;
    }
  };

  for (const side of sides) {
    const group = root.children.filter((c) => c.side === side);
    if (!group.length) continue;
    const total =
      group.reduce((s, c) => s + c.subH, 0) + gapY * (group.length - 1);
    let top = centerY - total / 2;
    for (const c of group) {
      place(c, top);
      top += c.subH + gapY;
    }
  }
}

/** 向下布局 */
function layoutDown(root: T, gapX: number, gapY: number) {
  for (const c of root.children) computeSubW(c, gapX);

  const rowH: number[] = [];
  const collectRows = (t: T) => {
    rowH[t.depth] = Math.max(rowH[t.depth] ?? 0, t.h);
    for (const c of t.children) collectRows(c);
  };
  collectRows(root);

  const rowY: number[] = [0];
  for (let d = 1; d < rowH.length; d++) {
    rowY[d] = rowY[d - 1] + (rowH[d - 1] ?? 0) + gapY;
  }

  root.x = 0;
  root.y = 0;

  const place = (t: T, left: number) => {
    t.x = left + (t.subW - t.w) / 2;
    t.y = rowY[t.depth] ?? 0;
    let cursor = left;
    for (const c of t.children) {
      c.side = 1;
      place(c, cursor);
      cursor += c.subW + gapX;
    }
  };

  const totalW =
    root.children.reduce((s, c) => s + c.subW, 0) +
    gapX * Math.max(0, root.children.length - 1);
  let left = root.w / 2 - totalW / 2;
  for (const c of root.children) {
    place(c, left);
    left += c.subW + gapX;
  }
}

/** 归一化到 (0,0) 起点并生成扁平结果 */
function normalize(rootT: T): LayoutResult {
  const all: T[] = [];
  const collect = (t: T) => {
    all.push(t);
    for (const c of t.children) collect(c);
  };
  collect(rootT);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of all) {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + t.w);
    maxY = Math.max(maxY, t.y + t.h);
  }
  const dx = -minX;
  const dy = -minY;

  const byId = new Map<string, PlacedNode>();
  const build = (t: T, parent: PlacedNode | null): PlacedNode => {
    const p: PlacedNode = {
      id: t.id,
      node: t.node,
      x: t.x + dx,
      y: t.y + dy,
      w: t.w,
      h: t.h,
      depth: t.depth,
      side: t.side,
      branch: t.branch,
      parent,
      children: [],
    };
    byId.set(p.id, p);
    p.children = t.children.map((c) => build(c, p));
    return p;
  };
  const root = build(rootT, null);

  const nodes = Array.from(byId.values());
  const edges: LayoutEdge[] = [];
  for (const n of nodes) {
    if (n.parent) edges.push({ from: n.parent, to: n });
  }

  return {
    root,
    nodes,
    edges,
    width: maxX - minX,
    height: maxY - minY,
    byId,
  };
}
