/**
 * 仅用于本地预览的 Obsidian API 轻量模拟（不打包进插件）
 */

const ICONS: Record<string, string> = {
  "git-fork": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="5" r="2.4"/><circle cx="18" cy="5" r="2.4"/><circle cx="12" cy="19" r="2.4"/><path d="M6 7.5v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-3"/><path d="M12 13.5V16"/></svg>',
  "zoom-in": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M11 8v6M8 11h6"/></svg>',
  "zoom-out": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6"/></svg>',
  maximize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/></svg>',
  "chevrons-down-up": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 20l5-5 5 5M7 4l5 5 5-5"/></svg>',
  "chevrons-up-down": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  crosshair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  "undo-2": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10H9"/></svg>',
  "redo-2": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h6"/></svg>',
  "rotate-ccw": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9.5" cy="15" r="1.2" fill="currentColor"/></svg>',
  network: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M5 16v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/></svg>',
  "more-horizontal": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  "arrow-right": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M14 6l6 6-6 6"/></svg>',
  "arrow-left": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12H4M10 6l-6 6 6 6"/></svg>',
  "arrow-down": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v16M6 14l6 6 6-6"/></svg>',
  "arrow-up": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V4M6 10l6-6 6 6"/></svg>',
  eraser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16l6-6 8 8-3 3H7z"/><path d="M18 20h4"/></svg>',
  "help-circle": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7"/><circle cx="12" cy="17" r=".8" fill="currentColor"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11 6"/><path d="M14 11a4 4 0 0 0-5.7 0L6 13.3a4 4 0 0 0 5.7 5.7L13 18"/></svg>',
  "indent-increase": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M10 12h10M10 18h10M4 10l3 2-3 2"/></svg>',
  "indent-decrease": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M10 12h10M10 18h10M7 10l-3 2 3 2"/></svg>',
  "git-branch-plus": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><path d="M6 7.5v9"/><path d="M13 5h4a3 3 0 0 1 3 3v3"/><path d="M16 8v3M13 11h6"/></svg>',
  "clipboard-list": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="4" width="10" height="17" rx="2"/><path d="M9 3h6v3H9z"/><path d="M10 11h4M10 15h4"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5h10"/></svg>',
};

export function setIcon(el: HTMLElement, name: string) {
  el.innerHTML = ICONS[name] ?? ICONS["git-fork"];
}

export class Component {
  registerEvent(_ref: any) {
    return _ref;
  }
  registerDomEvent(el: any, type: string, cb: any, opts?: any) {
    el.addEventListener(type, cb, opts);
    return el;
  }
  register(cb: any) {
    return cb;
  }
  load() {}
  unload() {}
}

export class App {
  vault: any;
  workspace: any;
}

export class TFile {
  path = "";
  basename = "";
  extension = "md";
}

export class WorkspaceLeaf {
  view: any;
}

export class ItemView extends Component {
  app: any;
  leaf: any;
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  constructor(leaf: any) {
    super();
    this.leaf = leaf;
    this.containerEl = document.createElement("div");
    this.contentEl = document.createElement("div");
    this.containerEl.appendChild(this.contentEl);
  }
  getViewType() {
    return "";
  }
  getDisplayText() {
    return "";
  }
  getIcon() {
    return "";
  }
  addAction() {
    return document.createElement("button");
  }
  async onOpen() {}
  async onClose() {}
  async setState() {}
  getState() {
    return {};
  }
}

export class MarkdownView extends ItemView {
  file: any = null;
  editor: any = null;
}

export class Plugin extends Component {
  app: any;
  manifest: any = {};
}

export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl: HTMLElement;
  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
  }
  display() {}
}

export class Setting {
  constructor(_el: HTMLElement) {}
  setName() {
    return this;
  }
  setDesc() {
    return this;
  }
  setHeading() {
    return this;
  }
  addDropdown() {
    return this;
  }
  addToggle() {
    return this;
  }
  addText() {
    return this;
  }
}

export class Modal {
  app: any;
  containerEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  modalEl: HTMLElement;
  constructor(app: any) {
    this.app = app;
    this.containerEl = document.createElement("div");
    this.containerEl.className = "modal-container";
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal";
    this.modalEl.appendChild(this.containerEl);
    this.titleEl = document.createElement("div");
    this.contentEl = document.createElement("div");
    this.containerEl.appendChild(this.contentEl);
  }
  open() {
    document.body.appendChild(this.modalEl);
    this.onOpen();
  }
  close() {
    this.onClose();
    this.modalEl.remove();
  }
  onOpen() {}
  onClose() {}
}

export class Notice {
  constructor(message: string) {
    console.log("[Notice]", message);
  }
}

export class Menu {
  addItem(_cb: any) {
    return this;
  }
  addSeparator() {
    return this;
  }
  showAtMouseEvent(_ev: any) {}
}

/* ---------------- 极简 Markdown 渲染（仅用于预览） ---------------- */

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(text: string): string {
  let h = escapeHtml(text);
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  h = h.replace(/==(.+?)==/g, "<mark>$1</mark>");
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/!\[\[([^\]|]+)\]\]/g, '<span class="internal-embed">🖼 $1</span>');
  h = h.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, p1, p2) => `<a class="internal-link">${p2 || p1}</a>`);
  h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => `<img alt="${alt}" src="${src}">`);
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return h;
}

export class MarkdownRenderer {
  static async render(_app: any, md: string, el: HTMLElement, _path: string, _comp: any) {
    el.innerHTML = renderMd(md);
    return;
  }
}

function renderMd(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  const closeList = () => {};

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      out.push("");
      i++;
      continue;
    }

    // 代码块
    const fence = /^```(\w*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++;
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    // 表格
    if (/^\s*\|/.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      const cells = rows
        .filter((r) => !/^\s*\|[\s:|-]+\|?\s*$/.test(r))
        .map((r) =>
          r
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim())
        );
      const head = cells.shift() ?? [];
      out.push(
        `<table><thead><tr>${head
          .map((c) => `<th>${inline(c)}</th>`)
          .join("")}</tr></thead><tbody>${cells
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`
      );
      continue;
    }

    // 引用
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote><p>${body.map(inline).join("<br>")}</p></blockquote>`);
      continue;
    }

    // 分割线
    if (/^\s*---\s*$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // 列表
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const ordered = /^\d/.test(li[2]);
      const items: string[] = [];
      const baseIndent = li[1].length;
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m || m[1].length < baseIndent) break;
        if (m[1].length > baseIndent) {
          // 简单处理：嵌套列表并入上一项
          const sub: string[] = [];
          const subIndent = m[1].length;
          while (i < lines.length) {
            const mm = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
            if (!mm || mm[1].length < subIndent) break;
            sub.push(`<li>${inline(mm[3])}</li>`);
            i++;
          }
          items[items.length - 1] =
            items[items.length - 1].replace(/<\/li>$/, "") +
            `<ul>${sub.join("")}</ul></li>`;
          continue;
        }
        let content = m[3];
        let prefix = "";
        const task = /^\[([ xX])\]\s+(.*)$/.exec(content);
        if (task) {
          prefix = `<input type="checkbox" ${task[1].toLowerCase() === "x" ? "checked" : ""} disabled> `;
          content = task[2];
        }
        items.push(`<li>${prefix}${inline(content)}</li>`);
        i++;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }

    // 标题
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }

    // 段落（支持两个空格硬换行）
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !/^\s*\|/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^```/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(
      `<p>${para
        .map((l) => inline(l.replace(/\s+$/, "")))
        .join("<br>")}</p>`
    );
  }

  closeList();
  return out.join("");
}
