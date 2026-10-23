// The Changes view (components/changes): everything an agent's branch changed
// against its base, uncommitted work included, as a tree of files beside one
// file's diff, the way an editor's source control shows it. What is pure
// about it: the diff's rows, which unchanged stretches fold away, where each
// hunk starts, the words that changed within a line, the side-by-side rows,
// and the folders' totals. And the view's state: which ref it shows, and how.
import { diffWordsWithSpace } from 'diff';
import { useSyncExternalStore } from 'react';
import * as T from '../../shared/api.ts';
import { diffRows, type DiffRow } from './files.ts';
import type { TreeNode } from './pulls.ts';

export type { DiffRow };

// A range of a line's characters, [start, end).
export type Range = [number, number];

// context is how many unchanged lines show around a change; a stretch only
// folds when it would hide more than minFold.
export const context = 3;
const minFold = 2;
// How many lines one click on a fold's arrow shows.
export const foldStep = 20;

// Fold is an unchanged stretch of rows, [start, end), hidden but for what was
// shown of it from either end. Its id is where it starts, which stays put
// while the rows do.
export interface Fold {
  id: number;
  start: number;
  end: number;
}

// Shown is how much of each fold was opened, by its id: lines from its top
// and from its bottom.
export type Shown = ReadonlyMap<number, { top: number; bottom: number }>;

// An item of the diff as drawn: a row (its index into the rows), or what is
// still folded of a fold.
export type Item = { kind: 'row'; index: number } | { kind: 'fold'; fold: Fold; hidden: number; first: number };

// layout is which rows show, and the folds between them: an unchanged stretch
// keeps `context` lines next to each change, the rest folds unless opened.
export function layout(rows: readonly DiffRow[], shown: Shown = new Map(), around = context): Item[] {
  const items: Item[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].sign !== ' ') {
      items.push({ kind: 'row', index: i++ });
      continue;
    }
    let end = i;
    while (end < rows.length && rows[end].sign === ' ') end++;
    const keepTop = i === 0 ? 0 : around;
    const keepBottom = end === rows.length ? 0 : around;
    const id = i;
    const open = shown.get(id) ?? { top: 0, bottom: 0 };
    const top = Math.min(end, i + keepTop + open.top);
    const bottom = Math.max(top, end - keepBottom - open.bottom);
    if (bottom - top <= minFold && !(i === 0 && end === rows.length)) {
      for (let j = i; j < end; j++) items.push({ kind: 'row', index: j });
    } else {
      for (let j = i; j < top; j++) items.push({ kind: 'row', index: j });
      if (bottom > top) items.push({ kind: 'fold', fold: { id, start: i, end }, hidden: bottom - top, first: top });
      for (let j = bottom; j < end; j++) items.push({ kind: 'row', index: j });
    }
    i = end;
  }
  return items;
}

// openFold shows more of a fold: `foldStep` lines from its top (up) or its
// bottom (down), or all of it.
export function openFold(shown: Shown, fold: Fold, how: 'up' | 'down' | 'all'): Shown {
  const next = new Map(shown);
  const was = shown.get(fold.id) ?? { top: 0, bottom: 0 };
  if (how === 'all') next.set(fold.id, { top: fold.end - fold.start, bottom: 0 });
  else next.set(fold.id, how === 'down' ? { ...was, top: was.top + foldStep } : { ...was, bottom: was.bottom + foldStep });
  return next;
}

// hunks is the index of the first row of each run of changed rows.
export function hunks(rows: readonly DiffRow[]): number[] {
  const out: number[] = [];
  rows.forEach((row, i) => {
    if (row.sign !== ' ' && (i === 0 || rows[i - 1].sign === ' ')) out.push(i);
  });
  return out;
}

// Words are the ranges of a line that changed, for the rows that have them,
// by row index.
export type Words = ReadonlyMap<number, Range[]>;

// words pairs each run's removed lines with its added ones, in order, as a
// review tool does, and marks what changed within each pair. A pair too
// different, or too long, is left whole: marking most of a line says less
// than marking none of it.
export function words(rows: readonly DiffRow[]): Words {
  const out = new Map<number, Range[]>();
  let i = 0;
  while (i < rows.length) {
    if (rows[i].sign === ' ') {
      i++;
      continue;
    }
    const dels: number[] = [];
    const adds: number[] = [];
    for (; i < rows.length && rows[i].sign !== ' '; i++) (rows[i].sign === '-' ? dels : adds).push(i);
    for (let k = 0; k < Math.min(dels.length, adds.length); k++) {
      const pair = lineWords(rows[dels[k]].text, rows[adds[k]].text);
      if (!pair) continue;
      if (pair.old.length) out.set(dels[k], pair.old);
      if (pair.new.length) out.set(adds[k], pair.new);
    }
  }
  return out;
}

const longLine = 1000;

// lineWords is what changed between two versions of a line, as ranges of
// each, or null when they share too little to be worth marking.
export function lineWords(a: string, b: string): { old: Range[]; new: Range[] } | null {
  if (a.length > longLine || b.length > longLine) return null;
  const old: Range[] = [];
  const now: Range[] = [];
  let o = 0;
  let n = 0;
  let same = 0;
  for (const part of diffWordsWithSpace(a, b)) {
    const len = part.value.length;
    if (part.removed) {
      push(old, o, o + len);
      o += len;
    } else if (part.added) {
      push(now, n, n + len);
      n += len;
    } else {
      // Whitespace alone doesn't make two lines alike.
      same += part.value.trim().length;
      o += len;
      n += len;
    }
  }
  const longest = Math.max(a.trim().length, b.trim().length);
  if (longest === 0 || same / longest < 0.4) return null;
  return { old, new: now };
}

// push adds a range, joining it to the last when they touch.
function push(ranges: Range[], start: number, end: number) {
  const last = ranges[ranges.length - 1];
  if (last && last[1] === start) last[1] = end;
  else ranges.push([start, end]);
}

// A row of the side-by-side view: what each side has, as row indices, or a
// fold across both.
export type SplitItem = { kind: 'pair'; left?: number; right?: number } | { kind: 'fold'; fold: Fold; hidden: number; first: number };

// split lays the drawn items out in two columns: an unchanged row on both
// sides, a run's removed lines on the left beside its added ones on the right.
export function split(rows: readonly DiffRow[], items: readonly Item[]): SplitItem[] {
  const out: SplitItem[] = [];
  let dels: number[] = [];
  let adds: number[] = [];
  const flush = () => {
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) out.push({ kind: 'pair', left: dels[k], right: adds[k] });
    dels = [];
    adds = [];
  };
  for (const item of items) {
    if (item.kind === 'fold') {
      flush();
      out.push(item);
      continue;
    }
    const sign = rows[item.index].sign;
    if (sign === '-') {
      // A removed line after added ones starts a new run.
      if (adds.length) flush();
      dels.push(item.index);
    } else if (sign === '+') adds.push(item.index);
    else {
      flush();
      out.push({ kind: 'pair', left: item.index, right: item.index });
    }
  }
  flush();
  return out;
}

// A piece of a highlighted line: its text and colour, and whether it is in
// one of the line's changed words.
export interface Piece {
  text: string;
  color?: string;
  italic?: boolean;
  changed?: boolean;
}

type Token = { content: string; color?: string; fontStyle?: number };

// paint cuts a line's highlighted tokens (or its plain text, while they load)
// where its changed words start and end.
export function paint(text: string, tokens: readonly Token[] | undefined, ranges: readonly Range[] | undefined): Piece[] {
  const source: Piece[] = tokens?.length ? tokens.map((t) => ({ text: t.content, color: t.color, italic: t.fontStyle === 1 || undefined })) : [{ text }];
  if (!ranges?.length) return source;
  const out: Piece[] = [];
  let at = 0;
  for (const piece of source) {
    let from = 0;
    while (from < piece.text.length) {
      const pos = at + from;
      const inside = ranges.find(([s, e]) => pos >= s && pos < e);
      // Up to the end of the range it is in, or the start of the next one.
      const stop = inside ? inside[1] : Math.min(...ranges.filter(([s]) => s > pos).map(([s]) => s), Infinity);
      const len = Math.min(piece.text.length - from, stop - pos);
      out.push({ ...piece, text: piece.text.slice(from, from + len), ...(inside ? { changed: true } : {}) });
      from += len;
    }
    at += piece.text.length;
  }
  return out;
}

// The letter a change shows, as an editor's source control does.
export const badges: Record<string, string> = {
  [T.FileModified]: 'M',
  [T.FileAdded]: 'A',
  [T.FileDeleted]: 'D',
  [T.FileRenamed]: 'R',
  [T.FileUntracked]: 'U',
};

// Totals is what a folder's files added and removed, by its path.
export type Totals = ReadonlyMap<string, { additions: number; deletions: number }>;

export function totals(nodes: readonly TreeNode<T.WorktreeChange>[]): Totals {
  const out = new Map<string, { additions: number; deletions: number }>();
  const walk = (node: TreeNode<T.WorktreeChange>): { additions: number; deletions: number } => {
    if (node.kind === 'file') return { additions: node.file.additions, deletions: node.file.deletions };
    const sum = { additions: 0, deletions: 0 };
    for (const child of node.children) {
      const c = walk(child);
      sum.additions += c.additions;
      sum.deletions += c.deletions;
    }
    out.set(node.path, sum);
    return sum;
  };
  nodes.forEach(walk);
  return out;
}

// filterChanges keeps the files whose path has every word of the filter, in
// any case.
export function filterChanges(files: readonly T.WorktreeChange[], filter: string): T.WorktreeChange[] {
  const parts = filter.toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return [...files];
  return files.filter((f) => {
    const p = `${f.path} ${f.previousPath ?? ''}`.toLowerCase();
    return parts.every((w) => p.includes(w));
  });
}

// sidesRows is a changed file's rows, or none when there is no text to show.
export function sidesRows(sides: T.FileSides | undefined): DiffRow[] | null {
  if (!sides || sides.binary || sides.tooLarge) return null;
  return diffRows(sides.oldText, sides.newText);
}

// What the view shows, and how. One at a time: it covers the window.
export type DiffLayout = 'unified' | 'split';

export interface ChangesState {
  ref: string;
  path?: string;
  nonce: number;
}

const layoutKey = 'agentbox.changes.layout';
let state: ChangesState | null = null;
let nonce = 0;
let diffLayout: DiffLayout | undefined;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const emit = () => {
  for (const l of listeners) l();
};

// openChanges shows ref's changes, at path when given.
export function openChanges(ref: string, path?: string): void {
  state = { ref, path, nonce: ++nonce };
  emit();
}

export function closeChanges(): void {
  state = null;
  emit();
}

export function changesState(): ChangesState | null {
  return state;
}

export function useChanges(): ChangesState | null {
  return useSyncExternalStore(subscribe, changesState);
}

// The layout is remembered across restarts, side by side or one column.
export function changesLayout(): DiffLayout {
  diffLayout ??= globalThis.localStorage?.getItem(layoutKey) === 'split' ? 'split' : 'unified';
  return diffLayout;
}

export function setChangesLayout(next: DiffLayout): void {
  diffLayout = next;
  try {
    globalThis.localStorage?.setItem(layoutKey, next);
  } catch {
    // not kept, still applied
  }
  emit();
}

export function useChangesLayout(): DiffLayout {
  return useSyncExternalStore(subscribe, changesLayout);
}
