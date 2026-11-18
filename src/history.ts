import { LayoutMode } from "./types";

export interface Snapshot {
  /** 整棵树（含折叠状态与源码位置） */
  tree: string;
  mode: LayoutMode;
  /** 视图级调整（层级 / 顺序 / 卡片位置） */
  adjust: string;
  /** 若本次改动写入了笔记，记录被改写行的原文，撤销时还原 */
  fileUndo?: { line: number; text: string };
}

export class History {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private limit = 80;

  push(snap: Snapshot) {
    this.undoStack.push(snap);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo(current: Snapshot): Snapshot | null {
    const snap = this.undoStack.pop();
    if (!snap) return null;
    this.redoStack.push(current);
    return snap;
  }

  redo(current: Snapshot): Snapshot | null {
    const snap = this.redoStack.pop();
    if (!snap) return null;
    this.undoStack.push(current);
    return snap;
  }

  /** 丢弃最近一次 push（操作用不上时回滚历史） */
  dropLast() {
    this.undoStack.pop();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
