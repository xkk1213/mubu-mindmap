/**
 * 视图级调整（不改动 Markdown 原文）
 *
 * 需求：导图里想把某个条目拖到别的层级 / 换顺序 / 把卡片挪个位置，
 * 但又不想改动笔记正文。于是这里维护一份「覆盖层」：
 *
 *   - parent : 该节点在导图里挂到哪个父节点下（默认沿用 Markdown 的层级）
 *   - order  : 某个父节点下子节点的排列顺序
 *   - dx/dy  : 卡片相对自动布局位置的手工偏移
 *
 * 键使用「源码行号」而不是内存 id，这样重新解析笔记后依然能对上；
 * 同时记录标题做校验，笔记改动导致行号漂移时不会张冠李戴。
 */

import { MindNode } from "./types";

/** 根节点的键（根没有源码行号，单独给一个不会冲突的值） */
export const ROOT_KEY = "r";

export interface NodeAdjust {
  /** 新的父节点 key；ROOT_KEY 表示挂到根上 */
  parent?: string;
  /** 手工位置偏移（相对自动布局） */
  dx?: number;
  dy?: number;
  /** 手工卡片尺寸（拖右下角调整） */
  w?: number;
  h?: number;
  /** 校验用标题 */
  title?: string;
}

export interface ViewAdjust {
  /** 节点 key -> 调整项 */
  nodes: Record<string, NodeAdjust>;
  /** 父节点 key -> 子节点 key 的顺序 */
  order: Record<string, string[]>;
}

export function createAdjust(): ViewAdjust {
  return { nodes: {}, order: {} };
}

export function cloneAdjust(a: ViewAdjust): ViewAdjust {
  return JSON.parse(JSON.stringify(a)) as ViewAdjust;
}

export function isEmptyAdjust(a: ViewAdjust | null | undefined): boolean {
  if (!a) return true;
  return (
    Object.keys(a.nodes).length === 0 && Object.keys(a.order).length === 0
  );
}

export function keyOf(node: MindNode): string {
  return node.kind === "root" ? ROOT_KEY : "n" + node.line;
}

function norm(s: string): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

export function findParent(
  root: MindNode,
  target: MindNode
): { parent: MindNode; index: number } | null {
  let out: { parent: MindNode; index: number } | null = null;
  const walk = (n: MindNode) => {
    if (out) return;
    const i = n.children.indexOf(target);
    if (i >= 0) {
      out = { parent: n, index: i };
      return;
    }
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

export function isDescendant(a: MindNode, b: MindNode): boolean {
  if (a === b) return true;
  for (const c of a.children) if (isDescendant(c, b)) return true;
  return false;
}

function reindex(root: MindNode) {
  const walk = (n: MindNode, d: number) => {
    n.depth = d;
    for (const c of n.children) walk(c, d + 1);
  };
  walk(root, 0);
}

/** 记录某个父节点当前的子节点顺序 */
export function recordOrder(adjust: ViewAdjust, parent: MindNode) {
  adjust.order[keyOf(parent)] = parent.children.map((c) => keyOf(c));
}

function writeParent(
  adjust: ViewAdjust,
  node: MindNode,
  parent: MindNode
) {
  const key = keyOf(node);
  const cur = adjust.nodes[key] ?? {};
  const pk = keyOf(parent);
  if (pk === ROOT_KEY) delete cur.parent;
  else cur.parent = pk;
  cur.title = node.title;
  if (
    !cur.parent &&
    cur.dx === undefined &&
    cur.dy === undefined &&
    cur.w === undefined &&
    cur.h === undefined
  ) {
    delete adjust.nodes[key];
  } else {
    adjust.nodes[key] = cur;
  }
}

/**
 * 把覆盖层应用到一棵刚解析出来的树上（原地修改并返回同一个对象）。
 * 行号对不上 / 标题变了 / 形成环的调整会被自动丢弃（自愈）。
 */
export function applyAdjust(root: MindNode, adjust: ViewAdjust): MindNode {
  const nodes: MindNode[] = [];
  const keyOfNode = new Map<MindNode, string>();
  const byKey = new Map<string, MindNode>();
  const parsedParent = new Map<string, string | null>();

  const walk = (n: MindNode, parent: MindNode | null) => {
    const k = keyOf(n);
    if (byKey.has(k)) return;
    keyOfNode.set(n, k);
    byKey.set(k, n);
    parsedParent.set(k, parent ? keyOfNode.get(parent) ?? null : null);
    nodes.push(n);
    for (const c of n.children) walk(c, n);
  };
  walk(root, null);

  // ---- 校验调整项 ----
  const dropped = new Set<string>();
  for (const key of Object.keys(adjust.nodes)) {
    const node = byKey.get(key);
    const adj = adjust.nodes[key];
    if (!node) {
      delete adjust.nodes[key];
      dropped.add(key);
      continue;
    }
    if (adj.title !== undefined && norm(adj.title) !== norm(node.title)) {
      delete adjust.nodes[key];
      dropped.add(key);
    }
  }
  if (dropped.size) {
    for (const pk of Object.keys(adjust.order)) {
      const next = adjust.order[pk].filter((k) => !dropped.has(k));
      if (next.length) adjust.order[pk] = next;
      else delete adjust.order[pk];
    }
  }

  // ---- 有效父节点 ----
  const eff = new Map<string, string | null>();
  for (const [k, v] of parsedParent) eff.set(k, v);
  for (const [k, adj] of Object.entries(adjust.nodes)) {
    if (!adj.parent) continue;
    if (adj.parent !== ROOT_KEY && !byKey.has(adj.parent)) continue;
    eff.set(k, adj.parent);
  }

  // ---- 环检测：出现循环就退回 Markdown 原始父节点 ----
  for (const k of Array.from(eff.keys())) {
    const seen = new Set<string>();
    let cur: string | null = k;
    while (cur && cur !== ROOT_KEY) {
      if (seen.has(cur)) {
        eff.set(k, parsedParent.get(k) ?? null);
        break;
      }
      seen.add(cur);
      cur = eff.get(cur) ?? null;
    }
  }

  // ---- 重建 children ----
  for (const n of nodes) n.children = [];
  for (const n of nodes) {
    if (n === root) continue;
    const k = keyOfNode.get(n);
    if (!k) continue;
    const pk = eff.get(k) ?? null;
    const parent = pk && pk !== ROOT_KEY ? byKey.get(pk) ?? root : root;
    if (parent === n) continue;
    parent.children.push(n);
  }

  // ---- 应用顺序 ----
  for (const [pk, list] of Object.entries(adjust.order)) {
    const p = pk === ROOT_KEY ? root : byKey.get(pk);
    if (!p || p.children.length < 2) continue;
    const idx = new Map<string, number>();
    list.forEach((k, i) => {
      if (!idx.has(k)) idx.set(k, i);
    });
    p.children.sort((a, b) => {
      const ia = idx.get(keyOfNode.get(a) ?? "");
      const ib = idx.get(keyOfNode.get(b) ?? "");
      if (ia === undefined && ib === undefined) return 0;
      if (ia === undefined) return 1;
      if (ib === undefined) return -1;
      return ia - ib;
    });
  }

  reindex(root);
  return root;
}

/* ------------------------------------------------------------------ */
/* 结构操作（只改导图，不改 md）                                        */
/* ------------------------------------------------------------------ */

/** 缩进一级：成为上一个兄弟节点的子节点 */
export function indentNode(
  root: MindNode,
  node: MindNode,
  adjust: ViewAdjust
): boolean {
  const loc = findParent(root, node);
  if (!loc || loc.index === 0) return false;
  const prev = loc.parent.children[loc.index - 1];
  if (!prev) return false;
  loc.parent.children.splice(loc.index, 1);
  prev.children.push(node);
  prev.collapsed = false;
  recordOrder(adjust, loc.parent);
  recordOrder(adjust, prev);
  writeParent(adjust, node, prev);
  reindex(root);
  return true;
}

/** 提升一级：成为父节点的下一个兄弟节点 */
export function outdentNode(
  root: MindNode,
  node: MindNode,
  adjust: ViewAdjust
): boolean {
  const loc = findParent(root, node);
  if (!loc || loc.parent.kind === "root") return false;
  const g = findParent(root, loc.parent);
  if (!g) return false;
  loc.parent.children.splice(loc.index, 1);
  g.parent.children.splice(g.index + 1, 0, node);
  recordOrder(adjust, loc.parent);
  recordOrder(adjust, g.parent);
  writeParent(adjust, node, g.parent);
  reindex(root);
  return true;
}

/** 同级上移 / 下移 */
export function moveSibling(
  root: MindNode,
  node: MindNode,
  dir: -1 | 1,
  adjust: ViewAdjust
): boolean {
  const loc = findParent(root, node);
  if (!loc) return false;
  const sibs = loc.parent.children;
  const j = loc.index + dir;
  if (j < 0 || j >= sibs.length) return false;
  sibs[loc.index] = sibs[j];
  sibs[j] = node;
  recordOrder(adjust, loc.parent);
  return true;
}

/** 挂到指定父节点下（index 省略则追加到末尾） */
export function reparentTo(
  root: MindNode,
  node: MindNode,
  target: MindNode,
  adjust: ViewAdjust,
  index?: number
): boolean {
  if (node === target) return false;
  if (isDescendant(node, target)) return false;
  const loc = findParent(root, node);
  if (!loc) return false;
  loc.parent.children.splice(loc.index, 1);
  const at = index === undefined ? target.children.length : Math.max(0, Math.min(index, target.children.length));
  target.children.splice(at, 0, node);
  target.collapsed = false;
  recordOrder(adjust, loc.parent);
  recordOrder(adjust, target);
  writeParent(adjust, node, target);
  reindex(root);
  return true;
}

/** 还原某个节点的全部视图调整（层级 + 位置） */
export function resetNodeAdjust(
  root: MindNode,
  node: MindNode,
  adjust: ViewAdjust
): boolean {
  const key = keyOf(node);
  let changed = false;
  if (adjust.nodes[key]) {
    delete adjust.nodes[key];
    changed = true;
  }
  for (const pk of Object.keys(adjust.order)) {
    const before = adjust.order[pk];
    const next = before.filter((k) => k !== key);
    if (next.length !== before.length) {
      changed = true;
      if (next.length) adjust.order[pk] = next;
      else delete adjust.order[pk];
    }
  }
  return changed;
}

/** 统计：结构改动数 / 位置改动数 */
export function countAdjust(adjust: ViewAdjust | null | undefined) {
  let structure = 0;
  let position = 0;
  let sized = 0;
  if (!adjust) return { structure, position, sized, total: 0 };
  for (const adj of Object.values(adjust.nodes)) {
    if (adj.parent) structure++;
    if (adj.dx !== undefined || adj.dy !== undefined) position++;
    if (adj.w !== undefined || adj.h !== undefined) sized++;
  }
  return {
    structure,
    position,
    sized,
    total: structure + position + sized,
  };
}

/** 供画布使用的手工尺寸表 */
export function sizesOf(
  adjust: ViewAdjust
): Record<string, { w?: number; h?: number }> {
  const out: Record<string, { w?: number; h?: number }> = {};
  for (const [k, adj] of Object.entries(adjust.nodes)) {
    if (adj.w === undefined && adj.h === undefined) continue;
    out[k] = { w: adj.w, h: adj.h };
  }
  return out;
}

/** 写入手工尺寸（传 null 表示恢复自动尺寸） */
export function setSize(
  adjust: ViewAdjust,
  key: string,
  size: { w?: number; h?: number } | null,
  title?: string
) {
  const cur = adjust.nodes[key] ?? {};
  if (!size) {
    delete cur.w;
    delete cur.h;
  } else {
    if (size.w === undefined) delete cur.w;
    else cur.w = Math.round(size.w);
    if (size.h === undefined) delete cur.h;
    else cur.h = Math.round(size.h);
  }
  if (title && cur.title === undefined) cur.title = title;
  if (
    !cur.parent &&
    cur.dx === undefined &&
    cur.dy === undefined &&
    cur.w === undefined &&
    cur.h === undefined
  ) {
    delete adjust.nodes[key];
  } else {
    adjust.nodes[key] = cur;
  }
}

/** 供画布使用的偏移表 */
export function offsetsOf(adjust: ViewAdjust): Record<string, { dx: number; dy: number }> {
  const out: Record<string, { dx: number; dy: number }> = {};
  for (const [k, adj] of Object.entries(adjust.nodes)) {
    if (adj.dx === undefined && adj.dy === undefined) continue;
    out[k] = { dx: adj.dx ?? 0, dy: adj.dy ?? 0 };
  }
  return out;
}

/** 写入偏移 */
export function setOffset(
  adjust: ViewAdjust,
  key: string,
  dx: number,
  dy: number,
  title?: string
) {
  const cur = adjust.nodes[key] ?? {};
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
    delete cur.dx;
    delete cur.dy;
  } else {
    cur.dx = Math.round(dx);
    cur.dy = Math.round(dy);
  }
  if (title && cur.title === undefined) cur.title = title;
  if (
    !cur.parent &&
    cur.dx === undefined &&
    cur.dy === undefined &&
    cur.w === undefined &&
    cur.h === undefined
  ) {
    delete adjust.nodes[key];
  } else {
    adjust.nodes[key] = cur;
  }
}

/** 标题被改写后同步校验值，避免下次刷新被当成“对不上”而丢弃 */
export function retitleAdjust(adjust: ViewAdjust, key: string, title: string) {
  const cur = adjust.nodes[key];
  if (cur) cur.title = title;
}
