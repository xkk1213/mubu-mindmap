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

// src/layout.ts
var layout_exports = {};
__export(layout_exports, {
  computeLayout: () => computeLayout
});
module.exports = __toCommonJS(layout_exports);
function computeLayout(root, sizes, opts) {
  const { mode, gapX, gapY } = opts;
  const rootT = buildTree(root, sizes, null, 0, 1, 0);
  if (mode === "down") {
    layoutDown(rootT, gapX, gapY);
  } else if (mode === "right") {
    layoutHorizontal(rootT, gapX, gapY, /* @__PURE__ */ new Set());
  } else if (mode === "left") {
    layoutHorizontal(rootT, gapX, gapY, /* @__PURE__ */ new Set(), true);
  } else {
    const split = splitIndex(rootT.children);
    const leftSet = /* @__PURE__ */ new Set();
    rootT.children.forEach((c, i) => {
      if (i >= split)
        markSubtree(c, leftSet, -1);
    });
    layoutHorizontal(rootT, gapX, gapY, leftSet);
  }
  return normalize(rootT);
}
function markSubtree(t, set, side) {
  t.side = side;
  set.add(t);
  for (const c of t.children)
    markSubtree(c, set, side);
}
function buildTree(node, sizes, parent, depth, side, branch) {
  const size = sizes.get(node.id) ?? { w: 200, h: 42 };
  const t = {
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
    y: 0
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
function splitIndex(children) {
  const n = children.length;
  if (n <= 1)
    return n;
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
function estimateHeight(t) {
  if (!t.children.length)
    return t.h + 20;
  return Math.max(
    t.h + 20,
    t.children.reduce((sum, c) => sum + estimateHeight(c), 0)
  );
}
function computeSubH(t, gapY) {
  if (!t.children.length) {
    t.subH = t.h;
    return t.subH;
  }
  let sum = 0;
  for (const c of t.children)
    sum += computeSubH(c, gapY);
  sum += gapY * (t.children.length - 1);
  t.subH = Math.max(t.h, sum);
  return t.subH;
}
function computeSubW(t, gapX) {
  if (!t.children.length) {
    t.subW = t.w;
    return t.subW;
  }
  let sum = 0;
  for (const c of t.children)
    sum += computeSubW(c, gapX);
  sum += gapX * (t.children.length - 1);
  t.subW = Math.max(t.w, sum);
  return t.subW;
}
function layoutHorizontal(root, gapX, gapY, leftSet, forceLeft = false) {
  const sides = [1, -1];
  const colW = /* @__PURE__ */ new Map();
  const collectCols = (t, side) => {
    if (t.depth > 0) {
      const arr = colW.get(side) ?? [];
      arr[t.depth] = Math.max(arr[t.depth] ?? 0, t.w);
      colW.set(side, arr);
    }
    for (const c of t.children)
      collectCols(c, t.side === -1 ? -1 : 1);
  };
  for (const c of root.children) {
    if (forceLeft)
      markSubtree(c, leftSet, -1);
    c.side = leftSet.has(c) ? -1 : 1;
    collectCols(c, c.side);
    computeSubH(c, gapY);
  }
  const offsetFor = (side, depth) => {
    const arr = colW.get(side) ?? [];
    let off = gapX;
    for (let d = 1; d < depth; d++)
      off += (arr[d] ?? 0) + gapX;
    return off;
  };
  root.x = 0;
  root.y = 0;
  const centerY = root.h / 2;
  const place = (t, top) => {
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
    if (!group.length)
      continue;
    const total = group.reduce((s, c) => s + c.subH, 0) + gapY * (group.length - 1);
    let top = centerY - total / 2;
    for (const c of group) {
      place(c, top);
      top += c.subH + gapY;
    }
  }
}
function layoutDown(root, gapX, gapY) {
  for (const c of root.children)
    computeSubW(c, gapX);
  const rowH = [];
  const collectRows = (t) => {
    rowH[t.depth] = Math.max(rowH[t.depth] ?? 0, t.h);
    for (const c of t.children)
      collectRows(c);
  };
  collectRows(root);
  const rowY = [0];
  for (let d = 1; d < rowH.length; d++) {
    rowY[d] = rowY[d - 1] + (rowH[d - 1] ?? 0) + gapY;
  }
  root.x = 0;
  root.y = 0;
  const place = (t, left2) => {
    t.x = left2 + (t.subW - t.w) / 2;
    t.y = rowY[t.depth] ?? 0;
    let cursor = left2;
    for (const c of t.children) {
      c.side = 1;
      place(c, cursor);
      cursor += c.subW + gapX;
    }
  };
  const totalW = root.children.reduce((s, c) => s + c.subW, 0) + gapX * Math.max(0, root.children.length - 1);
  let left = root.w / 2 - totalW / 2;
  for (const c of root.children) {
    place(c, left);
    left += c.subW + gapX;
  }
}
function normalize(rootT) {
  const all = [];
  const collect = (t) => {
    all.push(t);
    for (const c of t.children)
      collect(c);
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
  const byId = /* @__PURE__ */ new Map();
  const build = (t, parent) => {
    const p = {
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
      children: []
    };
    byId.set(p.id, p);
    p.children = t.children.map((c) => build(c, p));
    return p;
  };
  const root = build(rootT, null);
  const nodes = Array.from(byId.values());
  const edges = [];
  for (const n of nodes) {
    if (n.parent)
      edges.push({ from: n.parent, to: n });
  }
  return {
    root,
    nodes,
    edges,
    width: maxX - minX,
    height: maxY - minY,
    byId
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  computeLayout
});
