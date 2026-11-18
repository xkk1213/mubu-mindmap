/**
 * 放大查看器：图片 / 表格 / 整张卡片点开后在整屏浮层里查看。
 *
 * 设计要点：
 * - 独立挂到 body 上，不参与画布 transform，不受缩放影响；
 * - 打开时把画布的 CSS 变量复制到浮层根节点，因此深浅色与卡片配色完全一致；
 * - 支持浮层叠浮层（卡片 → 卡片内的表格 / 图片），按 Esc 只关最上面那层；
 * - 卡片模式可以用方向键在卡片之间切换，‹ › 按文档顺序前后翻；
 * - 表格默认 1:1，可滚轮缩放、拖拽平移、双击复位、一键「适应窗口」看全貌；
 * - 全部用原生 DOM，方便在预览环境里做自动化验证。
 */

const VAR_NAMES = [
  "--mbm-bg",
  "--mbm-card",
  "--mbm-card-border",
  "--mbm-card-border-strong",
  "--mbm-text",
  "--mbm-text-2",
  "--mbm-text-3",
  "--mbm-marker",
  "--mbm-accent",
  "--mbm-accent-soft",
  "--mbm-border",
  "--mbm-code-bg",
  "--mbm-table-border",
  "--mbm-table-head",
  "--mbm-chip",
  "--mbm-toolbar",
  "--mbm-hover",
  // 强调：浮层不复制这几个变量，放大卡片里的荧光笔就只剩描边、没有底色
  "--mbm-strong-bg",
  "--mbm-strong-bg-head",
  "--mbm-strong-text",
  "--mbm-strong-accent",
];

export type NavDir = "left" | "right" | "up" | "down";

/** 浮层内容由 build() 现场生成，导航后重新调用即可换内容 */
export interface ViewerContent {
  content: HTMLElement;
  natural: { w: number; h: number };
  title: string;
  subtitle?: string;
}

interface ViewerOpts {
  /** 现场生成内容；返回 null 表示没有内容可显示 */
  build: () => ViewerContent | null;
  /** 参考画布（取 CSS 变量） */
  themeHost: HTMLElement;
  /** 初始缩放；不传则 1:1（超宽时自动缩小到可见） */
  initialScale?: (fit: number) => number;
  /** 卡片切换 */
  nav?: {
    prev: () => boolean;
    next: () => boolean;
    go: (dir: NavDir) => boolean;
  };
  /** 每换一次内容都会调用，用来给内容里的表格 / 图片挂放大事件 */
  decorate?: (content: HTMLElement, host: HTMLElement, viewer: MediaViewer) => void;
  /** 底部提示文案 */
  hint?: string;
  /** 是否让舞台按内容尺寸定宽定高（卡片模式需要） */
  stageSize?: boolean;
  onClose?: () => void;
}

/** 打开中的浮层，栈顶才是键盘事件的目标 */
const stack: MediaViewer[] = [];

const DIR_KEYS: Record<string, NavDir> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

export class MediaViewer {
  readonly root: HTMLElement;
  private stage: HTMLElement;
  private titleEl: HTMLElement;
  private subEl: HTMLElement;
  private zoomLabel: HTMLElement;
  private k = 1;
  private tx = 0;
  private ty = 0;
  private natural = { w: 1, h: 1 };
  private dragging: { x: number; y: number; tx: number; ty: number } | null = null;
  private keyHandler: (ev: KeyboardEvent) => void;
  private moved = false;
  private closed = false;

  constructor(private opts: ViewerOpts) {
    this.root = createDiv();
    this.root.className = "mbm-lb";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", "放大查看");

    // 主题变量
    const cs = getComputedStyle(opts.themeHost);
    for (const name of VAR_NAMES) {
      const v = cs.getPropertyValue(name);
      if (v) this.root.style.setProperty(name, v.trim());
    }
    const host = opts.themeHost;
    const dark =
      host.closest(".mbm-theme-dark") !== null ||
      host.classList.contains("mbm-theme-dark");
    this.root.classList.add(dark ? "mbm-theme-dark" : "mbm-theme-light");

    // 继承画布的强调状态：放大卡片里也要有荧光笔 / 强调开关
    for (const cls of [
      "mbm-strong-mark",
      "mbm-strong-markall",
      "mbm-strong-color",
      "mbm-strong-bold",
      "mbm-strong-underline",
      "mbm-emphasis-off",
    ]) {
      if (host.classList.contains(cls) || host.closest(`.${cls}`)) {
        this.root.classList.add(cls);
      }
    }

    const head = createDiv();
    head.className = "mbm-lb-head";

    const titles = createDiv();
    titles.className = "mbm-lb-titles";
    this.titleEl = createDiv();
    this.titleEl.className = "mbm-lb-title";
    this.subEl = createDiv();
    this.subEl.className = "mbm-lb-sub";
    titles.appendChild(this.titleEl);
    titles.appendChild(this.subEl);
    head.appendChild(titles);

    const actions = createDiv();
    actions.className = "mbm-lb-actions";
    const mkBtn = (label: string, text: string, fn: () => void, cls = "") => {
      const b = createEl("button");
      b.className = "mbm-lb-btn" + (cls ? " " + cls : "");
      b.type = "button";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.textContent = text;
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        fn();
      });
      actions.appendChild(b);
      return b;
    };

    if (opts.nav) {
      mkBtn("上一个节点", "‹", () => this.step("prev"), "mbm-lb-nav");
      mkBtn("下一个节点", "›", () => this.step("next"), "mbm-lb-nav");
      const sep = createSpan();
      sep.className = "mbm-lb-sep";
      actions.appendChild(sep);
    }

    this.zoomLabel = createSpan();
    this.zoomLabel.className = "mbm-lb-zoom";
    actions.appendChild(this.zoomLabel);
    mkBtn("缩小", "−", () => this.zoomBy(1 / 1.25));
    mkBtn("放大", "+", () => this.zoomBy(1.25));
    mkBtn("适应窗口", "适应", () => this.fit());
    mkBtn("原始大小", "1:1", () => this.reset());
    const close = mkBtn("关闭", "✕", () => this.close(), "mbm-lb-close");
    close.setAttribute("aria-label", "关闭（Esc）");
    head.appendChild(actions);

    const body = createDiv();
    body.className = "mbm-lb-body";
    this.stage = createDiv();
    this.stage.className = "mbm-lb-stage";
    body.appendChild(this.stage);

    const foot = createDiv();
    foot.className = "mbm-lb-foot";
    foot.textContent =
      opts.hint ?? "滚轮缩放 · 按住拖动平移 · 双击复位 · Esc 关闭";

    this.root.appendChild(head);
    this.root.appendChild(body);
    this.root.appendChild(foot);
    document.body.appendChild(this.root);
    this.root.setCssStyles({ zIndex: String(9998 + stack.length * 10) });
    stack.push(this);

    // 事件
    body.addEventListener(
      "wheel",
      (ev) => {
        ev.preventDefault();
        const rect = body.getBoundingClientRect();
        const factor = Math.exp(-ev.deltaY * 0.0018);
        this.zoomBy(factor, ev.clientX - rect.left, ev.clientY - rect.top);
      },
      { passive: false }
    );

    body.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      this.dragging = { x: ev.clientX, y: ev.clientY, tx: this.tx, ty: this.ty };
      this.moved = false;
      this.root.classList.add("is-dragging");
      try {
        body.setPointerCapture?.(ev.pointerId);
      } catch {
        /* ignore */
      }
    });
    body.addEventListener("pointermove", (ev) => {
      if (!this.dragging) return;
      const dx = ev.clientX - this.dragging.x;
      const dy = ev.clientY - this.dragging.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.moved = true;
      this.tx = this.dragging.tx + dx;
      this.ty = this.dragging.ty + dy;
      this.apply();
    });
    const stop = (ev: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = null;
      this.root.classList.remove("is-dragging");
      try {
        body.releasePointerCapture?.(ev.pointerId);
      } catch {
        /* ignore */
      }
      // 让紧随其后的 click 能读到 moved，再复位
      window.setTimeout(() => {
        this.moved = false;
      }, 0);
    };
    body.addEventListener("pointerup", stop);
    body.addEventListener("pointercancel", stop);
    body.addEventListener("dblclick", () => this.reset());

    // 点击浮层空白（头部/底部以外、且没拖动）关闭
    this.root.addEventListener("click", (ev) => {
      if (ev.target === this.root || ev.target === body || ev.target === this.stage) {
        if (!this.moved) this.close();
      }
    });

    this.keyHandler = (ev: KeyboardEvent) => {
      // 只让最上面的一层响应键盘，避免叠浮层时一次关掉两层
      if (stack[stack.length - 1] !== this) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        this.close();
        return;
      }
      const nav = this.opts.nav;
      if (!nav) return;
      const dir = DIR_KEYS[ev.key];
      if (dir) {
        ev.preventDefault();
        ev.stopPropagation();
        if (nav.go(dir)) this.refresh();
        return;
      }
      if (ev.key === "PageUp" || ev.key === "PageDown") {
        ev.preventDefault();
        ev.stopPropagation();
        if (this.step(ev.key === "PageUp" ? "prev" : "next", false)) {
          /* 已刷新 */
        }
      }
    };
    window.addEventListener("keydown", this.keyHandler, true);

    requestAnimationFrame(() => {
      this.root.classList.add("is-open");
      this.render(true);
    });
  }

  /** 是否刚拖动过（用于区分「拖动平移」和「点一下放大里面的表格」） */
  wasDragging() {
    return this.moved;
  }

  private get size() {
    const body = this.root.querySelector(".mbm-lb-body") as HTMLElement;
    return { w: body.clientWidth, h: body.clientHeight };
  }

  private fitScale() {
    const { w, h } = this.size;
    const pad = 56;
    // 上限 1：只缩小不放大，避免小表格/小图被拉糊
    return Math.min(
      (w - pad) / Math.max(1, this.natural.w),
      (h - pad) / Math.max(1, this.natural.h),
      1
    );
  }

  private center() {
    const { w, h } = this.size;
    this.tx = (w - this.natural.w * this.k) / 2;
    this.ty = (h - this.natural.h * this.k) / 2;
  }

  private apply() {
    this.stage.setCssStyles({ transform: `translate(${this.tx}px, ${this.ty}px) scale(${this.k})` });
    this.stage.setCssStyles({ transformOrigin: "0 0" });
    this.zoomLabel.textContent = `${Math.round(this.k * 100)}%`;
  }

  private zoomBy(factor: number, px?: number, py?: number) {
    const next = Math.min(4, Math.max(0.15, this.k * factor));
    if (px !== undefined && py !== undefined) {
      const { w, h } = this.size;
      const ox = px ?? w / 2;
      const oy = py ?? h / 2;
      this.tx = ox - ((ox - this.tx) * next) / this.k;
      this.ty = oy - ((oy - this.ty) * next) / this.k;
    } else {
      this.tx -= (this.natural.w * (next - this.k)) / 2;
      this.ty -= (this.natural.h * (next - this.k)) / 2;
    }
    this.k = next;
    this.apply();
  }

  private fit() {
    this.k = Math.min(1, Math.max(0.12, this.fitScale()));
    this.center();
    this.apply();
  }

  private reset() {
    this.k = Math.min(1, Math.max(0.15, this.fitScale() > 1 ? 1 : this.fitScale()));
    this.center();
    this.apply();
  }

  /** 换内容（切卡片时用） */
  refresh() {
    if (this.closed) return;
    this.render(false);
  }

  private step(which: "prev" | "next", redraw = true) {
    const nav = this.opts.nav;
    if (!nav) return false;
    const ok = which === "prev" ? nav.prev() : nav.next();
    if (ok && redraw) this.refresh();
    return ok;
  }

  /** 渲染（首次 / 切换后）：换内容、更新标题、重新适应窗口 */
  private render(first: boolean) {
    const built = this.opts.build();
    if (!built) return;
    this.natural = built.natural;
    while (this.stage.firstChild) this.stage.removeChild(this.stage.firstChild);
    this.stage.appendChild(built.content);
    if (this.opts.stageSize) {
      this.stage.setCssStyles({ width: `${Math.ceil(built.natural.w)}px` });
      this.stage.setCssStyles({ height: `${Math.ceil(built.natural.h)}px` });
    }
    this.titleEl.textContent = built.title;
    this.subEl.textContent = built.subtitle ?? "";
    this.subEl.classList.toggle("is-hidden", !built.subtitle);
    this.opts.decorate?.(built.content, this.root, this);

    const fitK = this.fitScale();
    this.k = first
      ? this.opts.initialScale
        ? this.opts.initialScale(fitK)
        : Math.min(1, Math.max(fitK, 0.4))
      : Math.min(1, Math.max(fitK, 0.2));
    this.center();
    this.apply();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener("keydown", this.keyHandler, true);
    const at = stack.indexOf(this);
    if (at >= 0) stack.splice(at, 1);
    this.root.classList.remove("is-open");
    const el = this.root;
    window.setTimeout(() => el.remove(), 160);
    this.opts.onClose?.();
  }
}

/* ------------------------------------------------------------------ */
/* 图片                                                                */
/* ------------------------------------------------------------------ */

export function openImage(
  img: HTMLImageElement,
  themeHost: HTMLElement,
  onClose?: () => void
) {
  const src = img.getAttribute("src") ?? "";
  if (!src) return;
  const wrap = createEl("img");
  wrap.className = "mbm-lb-img";
  wrap.src = src;
  wrap.alt = img.getAttribute("alt") ?? "";
  const natural = {
    w: img.naturalWidth || 800,
    h: img.naturalHeight || 600,
  };
  wrap.setCssStyles({ width: `${natural.w}px` });
  wrap.setCssStyles({ height: `${natural.h}px` });

  new MediaViewer({
    build: () => ({
      content: wrap,
      natural,
      title: img.getAttribute("alt")?.trim() || "图片",
      subtitle: `${natural.w} × ${natural.h}`,
    }),
    themeHost,
    initialScale: (fit) => Math.min(1, Math.max(fit, 0.15)),
    onClose,
  });
}

/* ------------------------------------------------------------------ */
/* 表格                                                                */
/* ------------------------------------------------------------------ */

export function openTable(
  holder: HTMLElement,
  themeHost: HTMLElement,
  onClose?: () => void
) {
  const table = holder.querySelector("table");
  if (!table) return;

  const clone = table.cloneNode(true) as HTMLElement;
  clone.classList.add("mbm-lb-table");
  clone.setCssStyles({ width: "max-content" });
  clone.setCssStyles({ maxWidth: "none" });

  const box = createDiv();
  box.className = "mbm-lb-tablebox";
  box.appendChild(clone);

  const rows = clone.querySelectorAll("tbody tr").length;
  const cols =
    clone.querySelectorAll("thead th").length ||
    clone.querySelectorAll("tr:first-child th, tr:first-child td").length;

  // 原始尺寸：先渲染到屏幕外测量
  box.setCssStyles({ position: "absolute" });
  box.setCssStyles({ left: "-10000px" });
  box.setCssStyles({ top: "0" });
  document.body.appendChild(box);
  const rect = clone.getBoundingClientRect();
  const natural = {
    w: Math.max(160, Math.ceil(rect.width)),
    h: Math.max(80, Math.ceil(rect.height)),
  };
  // 清掉临时定位，否则挂进浮层后绝对定位会让舞台拿到 0 尺寸
  box.setCssStyles({ position: "" });
  box.setCssStyles({ left: "" });
  box.setCssStyles({ top: "" });
  box.remove();

  new MediaViewer({
    build: () => ({
      content: box,
      natural,
      title: "表格",
      subtitle: `${rows} 行 × ${cols} 列`,
    }),
    themeHost,
    initialScale: (fit) => Math.min(1, Math.max(fit, 0.28)),
    onClose,
  });
}

/* ------------------------------------------------------------------ */
/* 整张卡片                                                            */
/* ------------------------------------------------------------------ */

export interface CardSource {
  /** 画布上的卡片元素（.mbm-node），内部会被克隆 */
  el: HTMLElement;
  title: string;
  subtitle?: string;
}

export interface CardViewerOpts {
  themeHost: HTMLElement;
  /** 当前要展示的卡片 */
  getSource: () => CardSource | null;
  prev: () => boolean;
  next: () => boolean;
  go: (dir: NavDir) => boolean;
  onClose?: () => void;
}

/** 去掉行内样式后会丢的若干 CSS 变量，需要从原卡片搬到克隆体上 */
const COPY_VARS = ["--mbm-branch"];

/**
 * 克隆一张卡片，去掉所有交互控件，并给表格 / 图片挂上「单独放大」。
 * 放在浮层里时会放宽最大宽度、放大字号，读起来更像一页文档。
 */
function cloneCard(source: HTMLElement, host: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      ".mbm-toggle, .mbm-resize, .mbm-zoom-btn, .mbm-table-more, .mbm-card-zoom"
    )
    .forEach((n) => n.remove());
  clone.classList.add("mbm-lb-node");
  clone.removeAttribute("data-id");
  const vars: Array<[string, string]> = [];
  for (const name of COPY_VARS) {
    const v = source.style.getPropertyValue(name);
    if (v) vars.push([name, v]);
  }
  clone.removeAttribute("style");

  const wrap = createDiv();
  wrap.className = "mbm-lb-cardwrap";
  for (const [name, v] of vars) wrap.style.setProperty(name, v);
  wrap.appendChild(clone);

  // 量出自然尺寸（放在屏幕外，避免影响浮层布局）
  wrap.setCssStyles({ position: "absolute" });
  wrap.setCssStyles({ left: "-10000px" });
  wrap.setCssStyles({ top: "0" });
  document.body.appendChild(wrap);

  // 卡片按文字宽度排版时，图片 / 表格会被 max-width:100% 压小；
  // 这里量一次内容固有宽度，给放大视图留出足够横向空间。
  const box = () => clone.getBoundingClientRect();
  const firstW = Math.ceil(box().width);
  let intrinsic = 0;
  clone.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    intrinsic = Math.max(intrinsic, img.naturalWidth || 0);
  });
  clone.querySelectorAll<HTMLElement>("table").forEach((t) => {
    intrinsic = Math.max(intrinsic, t.scrollWidth || 0);
  });
  const maxW = 640;
  const target = Math.min(maxW, Math.max(firstW, intrinsic ? intrinsic + 34 : 0));
  wrap.setCssStyles({ width: `${target}px` });
  const rect = box();
  const natural = {
    w: Math.max(160, target),
    h: Math.max(80, Math.ceil(rect.height)),
  };
  wrap.setCssStyles({ position: "" });
  wrap.setCssStyles({ left: "" });
  wrap.setCssStyles({ top: "" });
  wrap.remove();

  bindInlineMedia(wrap, host);
  return { content: wrap, natural };
}

/** 卡片里的图片 / 表格：点一下再单独放大一层 */
function bindInlineMedia(content: HTMLElement, host: HTMLElement) {
  content.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    img.classList.add("mbm-lb-hit");
    img.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openImage(img, host);
    });
  });
  content.querySelectorAll<HTMLElement>(".mbm-block--table").forEach((holder) => {
    holder.classList.add("mbm-lb-hit");
    holder.addEventListener("click", (ev) => {
      if (!(ev.target as HTMLElement).closest("table")) return;
      ev.stopPropagation();
      openTable(holder, host);
    });
  });
}

/** 打开整张卡片的放大视图（可在卡片之间切换） */
export function openCard(opts: CardViewerOpts) {
  const build = (): ViewerContent | null => {
    const src = opts.getSource();
    if (!src) return null;
    const { content, natural } = cloneCard(src.el, opts.themeHost);
    return { content, natural, title: src.title, subtitle: src.subtitle };
  };

  return new MediaViewer({
    build,
    themeHost: opts.themeHost,
    stageSize: true,
    nav: { prev: opts.prev, next: opts.next, go: opts.go },
    hint: "← ↑ ↓ → 按方向切卡片 · 点卡片里的表格 / 图片可再放大 · 滚轮缩放 · Esc 关闭",
    initialScale: (fit) => Math.min(1, Math.max(fit, 0.2)),
    onClose: opts.onClose,
    decorate: (content, host) => {
      // 克隆体里已经绑定过内联媒体，这里只负责把嵌套浮层的主题变量对齐
      content.classList.add("mbm-lb-cardcontent");
      if (!host.classList.contains("mbm-theme-dark")) {
        content.classList.remove("mbm-theme-dark");
      }
    },
  });
}
