// Run with `npm test` (node's own test runner, which strips the types).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from '../../shared/api.ts';
import {
  badges,
  changesLayout,
  changesState,
  closeChanges,
  filterChanges,
  hunks,
  layout,
  lineWords,
  openChanges,
  openFold,
  paint,
  setChangesLayout,
  sidesRows,
  split,
  totals,
  words,
  type Item,
} from './changes.ts';
import { diffRows } from './files.ts';
import { fileTree } from './pulls.ts';

const lines = (n: number, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

// A 40-line file with line 10 changed and line 30 removed.
const before = lines(40);
const after = before.map((l, i) => (i === 9 ? 'changed 10' : l)).filter((_, i) => i !== 29);
const rows = diffRows(`${before.join('\n')}\n`, `${after.join('\n')}\n`);

const drawn = (items: Item[]) => items.map((it) => (it.kind === 'row' ? rows[it.index].sign + (rows[it.index].old ?? rows[it.index].new) : `…${it.hidden}`));

test('layout folds what is far from a change, keeping three lines around each', () => {
  const items = layout(rows);
  assert.deepEqual(drawn(items), [
    '…6',
    ' 7', ' 8', ' 9', '-10', '+10', ' 11', ' 12', ' 13',
    '…13',
    ' 27', ' 28', ' 29', '-30', ' 31', ' 32', ' 33',
    '…7',
  ]);
  const first = items[0];
  assert.ok(first.kind === 'fold');
  assert.deepEqual(first.fold, { id: 0, start: 0, end: 9 });
});

test('a fold opens a step at a time from either end, or all at once', () => {
  const middle = layout(rows).find((it) => it.kind === 'fold' && it.fold.id > 0);
  assert.ok(middle?.kind === 'fold');
  // Down from the change above it: 13 lines is less than a step, so all show.
  let shown = openFold(new Map(), middle.fold, 'down');
  assert.equal(layout(rows, shown).filter((it) => it.kind === 'fold').length, 2);
  shown = openFold(new Map(), middle.fold, 'all');
  assert.ok(!layout(rows, shown).some((it) => it.kind === 'fold' && it.fold.id === middle.fold.id));

  // A long stretch: a step from the bottom leaves the rest folded.
  const long = diffRows(`${lines(100).join('\n')}\nend\n`, `${lines(100).join('\n')}\nEND\n`);
  const fold = layout(long).find((it) => it.kind === 'fold');
  assert.ok(fold?.kind === 'fold' && fold.hidden === 97);
  const opened = layout(long, openFold(new Map(), fold.fold, 'up')).find((it) => it.kind === 'fold');
  assert.ok(opened?.kind === 'fold' && opened.hidden === 77 && opened.first === 0);
});

test('layout leaves short stretches alone, and folds an unchanged file whole', () => {
  const short = diffRows('a\nb\nc\nd\ne\nf\ng\nh\n', 'a\nB\nc\nd\ne\nf\ng\nH\n');
  assert.ok(layout(short).every((it) => it.kind === 'row'));
  const same = diffRows('a\nb\nc\nd\n', 'a\nb\nc\nd\n');
  assert.deepEqual(drawn(layout(same)).length, 1);
  assert.deepEqual(layout([]), []);
});

test('hunks are where each run of changes starts', () => {
  assert.deepEqual(hunks(rows), [9, 30]);
  assert.deepEqual(hunks(diffRows('', 'a\nb\n')), [0]);
});

test('words marks what changed within each removed and added pair', () => {
  const w = lineWords('const total = price * count;', 'const total = price * amount;');
  assert.deepEqual(w, { old: [[22, 27]], new: [[22, 28]] });
  // Too different: nothing marked.
  assert.equal(lineWords('return a', 'throw new Error(x)'), null);
  assert.equal(lineWords('x'.repeat(1200), 'y'), null);

  const r = diffRows('a\nlet x = 1;\nlet y = 2;\nb\n', 'a\nlet x = 10;\nlet y = 2; // two\nb\n');
  const marked = words(r);
  const del = r.findIndex((row) => row.sign === '-');
  const add = r.findIndex((row) => row.sign === '+');
  assert.deepEqual(marked.get(del), [[8, 9]]);
  assert.deepEqual(marked.get(add), [[8, 10]]);
  // The second pair only added: its removed line has nothing marked.
  assert.equal(marked.has(del + 1), false);
  assert.deepEqual(marked.get(add + 1), [[10, 17]]);
});

test('split puts a run of removed lines beside its added ones', () => {
  const r = diffRows('a\nb\nc\nd\n', 'a\nB\nC\nX\nd\n');
  const s = split(r, layout(r));
  assert.deepEqual(
    s.map((it) => (it.kind === 'pair' ? [it.left === undefined ? null : r[it.left].text, it.right === undefined ? null : r[it.right].text] : 'fold')),
    [['a', 'a'], ['b', 'B'], ['c', 'C'], [null, 'X'], ['d', 'd']],
  );
  // Removed lines after added ones start a pair of their own.
  const rows2 = [
    { sign: '+' as const, new: 1, text: 'x' },
    { sign: '-' as const, old: 1, text: 'y' },
  ];
  assert.deepEqual(split(rows2, layout(rows2)), [
    { kind: 'pair', left: undefined, right: 0 },
    { kind: 'pair', left: 1, right: undefined },
  ]);
  assert.ok(split(rows, layout(rows)).some((it) => it.kind === 'fold'));
});

test('paint cuts tokens where changed words start and end', () => {
  const tokens = [
    { content: 'let ', color: '#a' },
    { content: 'total', color: '#b', fontStyle: 1 },
    { content: ' = 1', color: '#c' },
  ];
  assert.deepEqual(paint('let total = 1', tokens, [[6, 10]]), [
    { text: 'let ', color: '#a', italic: undefined },
    { text: 'to', color: '#b', italic: true },
    { text: 'tal', color: '#b', italic: true, changed: true },
    { text: ' ', color: '#c', italic: undefined, changed: true },
    { text: '= 1', color: '#c', italic: undefined },
  ]);
  assert.deepEqual(paint('plain', undefined, undefined), [{ text: 'plain' }]);
  assert.deepEqual(paint('plain', [], [[0, 2]]), [{ text: 'pl', changed: true }, { text: 'ain' }]);
});

const change = (path: string, status: string, additions: number, deletions: number, previousPath?: string): T.WorktreeChange => ({ path, status, additions, deletions, ...(previousPath ? { previousPath } : {}) });

test('totals adds a folder up from everything under it', () => {
  const files = [change('src/a.ts', T.FileModified, 3, 1), change('src/lib/b.ts', T.FileAdded, 10, 0), change('README.md', T.FileModified, 1, 1)];
  const sums = totals(fileTree(files));
  assert.deepEqual(sums.get('src'), { additions: 13, deletions: 1 });
  assert.deepEqual(sums.get('src/lib'), { additions: 10, deletions: 0 });
  assert.equal(badges[T.FileRenamed], 'R');
  assert.equal(badges[T.FileUntracked], 'U');
});

test('filterChanges keeps paths with every word, old paths included', () => {
  const files = [change('src/app/main.ts', T.FileModified, 1, 0), change('docs/guide.md', T.FileRenamed, 0, 0, 'docs/old-guide.md'), change('src/lib/x.go', T.FileAdded, 2, 0)];
  assert.deepEqual(filterChanges(files, 'SRC main').map((f) => f.path), ['src/app/main.ts']);
  assert.deepEqual(filterChanges(files, 'old-guide').map((f) => f.path), ['docs/guide.md']);
  assert.equal(filterChanges(files, '  ').length, 3);
});

test('sidesRows diffs the two versions, unless there is no text', () => {
  assert.equal(sidesRows(undefined), null);
  assert.equal(sidesRows({ path: 'a', oldText: '', newText: '', binary: true }), null);
  assert.deepEqual(sidesRows({ path: 'a', oldText: 'x\n', newText: 'y\n' })?.map((r) => r.sign), ['-', '+']);
});

test('the view opens on a ref and a file, and remembers its layout', () => {
  openChanges('p/agent-01', 'src/a.ts');
  const first = changesState();
  assert.equal(first?.ref, 'p/agent-01');
  assert.equal(first?.path, 'src/a.ts');
  openChanges('p/agent-01', 'src/a.ts');
  assert.notEqual(changesState()?.nonce, first?.nonce);
  closeChanges();
  assert.equal(changesState(), null);
  assert.equal(changesLayout(), 'unified');
  setChangesLayout('split');
  assert.equal(changesLayout(), 'split');
});
