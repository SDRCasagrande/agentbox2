import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronsDownUp, ChevronUp, Columns2, FileDown, FileUp, GitCompare, Rows2, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import * as T from '../../../shared/api';
import { api } from '../../lib/api';
import {
  badges,
  closeChanges,
  foldStep,
  filterChanges,
  hunks as hunksOf,
  layout,
  openFold,
  setChangesLayout,
  sidesRows,
  split,
  totals,
  useChanges,
  useChangesLayout,
  words as wordsOf,
  type DiffLayout,
  type DiffRow,
  type Fold,
  type Item,
  type Shown,
  type SplitItem,
  type Words,
} from '../../lib/changes';
import { highlightLimit, languageOfPath } from '../../lib/files';
import { useT } from '../../lib/i18n';
import { fileTree, treeOrder } from '../../lib/pulls';
import { cn, errorMessage } from '../../lib/utils';
import { ChangeTree } from '../diff/ChangeTree';
import { Code } from '../diff/Code';
import { useTokens } from '../diff/useTokens';
import { Notice } from '../ui/card';
import { Dialog, DialogContent, DialogTitle, fullWhenNarrow } from '../ui/dialog';
import { Tip } from '../ui/tooltip';
import type { ThemedToken } from 'shiki/core';

// How often the view reads the changes again while it is open, so it follows
// the agent as it edits: a git diff --numstat and, for the file shown, two
// reads.
const liveInterval = 2000;

// ChangesHost is the Changes view, over the whole window while one is open
// (lib/changes' openChanges): mounted once, by App.
export function ChangesHost() {
  const open = useChanges();
  return (
    <Dialog open={open !== null} onOpenChange={(o) => !o && closeChanges()}>
      <DialogContent
        className={cn('flex h-[94vh] max-h-[94vh] w-[96vw] max-w-[1800px] flex-col gap-0 overflow-hidden p-0', fullWhenNarrow)}
        // Escape in a filter with text in it clears the filter, not the view.
        onEscapeKeyDown={(event) => {
          const el = document.activeElement;
          if (el instanceof HTMLInputElement && el.matches('[data-changes-filter]') && el.value) event.preventDefault();
        }}
        data-changes-view={open?.ref}
      >
        {open && <ChangesView key={open.ref} fileRef={open.ref} path={open.path} nonce={open.nonce} />}
      </DialogContent>
    </Dialog>
  );
}

const badgeTints: Record<string, string> = {
  modified: 'text-amber-400',
  added: 'text-emerald-400',
  untracked: 'text-emerald-400',
  deleted: 'text-rose-400',
  renamed: 'text-sky-400',
};

// Where to go once the next file's diff has loaded: its first change, or its
// last when going back.
type Pending = 'first' | 'last' | null;

// ChangesView is a worktree's changes since its base, as an editor's source
// control shows them: a tree of the changed files with what each and each
// folder added and removed, filtered by path, beside the picked file's diff,
// in one column or side by side. j/k move through the changes, into the next
// file at either end, and n/p through the files.
export function ChangesView({ fileRef, path, nonce }: { fileRef: string; path?: string; nonce: number }) {
  const t = useT();
  const diffLayout = useChangesLayout();
  const changes = useQuery({ queryKey: ['changes', fileRef], queryFn: () => api.worktreeChanges(fileRef), refetchInterval: liveInterval, retry: false });
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState<string | undefined>(path);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [hunk, setHunk] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const filterBox = useRef<HTMLInputElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const treeBox = useRef<HTMLDivElement>(null);
  useEffect(() => setPicked(path), [path, nonce]);

  const all = changes.data?.files;
  const files = useMemo(() => filterChanges(all ?? [], filter), [all, filter]);
  const tree = useMemo(() => fileTree(files), [files]);
  const order = useMemo(() => treeOrder(tree), [tree]);
  const sums = useMemo(() => totals(tree), [tree]);
  const selected = order.find((f) => f.path === picked) ?? all?.find((f) => f.path === picked) ?? order[0];

  const sides = useQuery({
    queryKey: ['fileSides', fileRef, selected?.path, selected?.previousPath],
    queryFn: () => api.fileSides(fileRef, selected!.path, selected!.previousPath),
    enabled: !!selected,
    refetchInterval: liveInterval,
    retry: false,
  });
  const rows = useMemo(() => sidesRows(sides.data), [sides.data]);
  const starts = useMemo(() => (rows ? hunksOf(rows) : []), [rows]);

  const select = (next: string, then: Pending = null) => {
    setPicked(next);
    setHunk(null);
    setPending(then);
    pane.current?.scrollTo({ top: 0 });
    // Focus in the tree follows the file, so one row looks picked, not two.
    const tree = treeBox.current;
    if (tree?.contains(document.activeElement)) requestAnimationFrame(() => tree.querySelector<HTMLElement>(`[data-tree-file="${CSS.escape(next)}"]`)?.focus());
  };
  // Another file: its first change, or its last going back, once it loads.
  useEffect(() => {
    if (!pending || !rows || sides.data?.path !== selected?.path) return;
    if (starts.length) setHunk(pending === 'first' ? 0 : starts.length - 1);
    setPending(null);
  }, [pending, rows, starts, sides.data, selected?.path]);
  useEffect(() => {
    if (hunk === null) return;
    pane.current?.querySelector(`[data-hunk="${hunk}"]`)?.scrollIntoView({ block: 'center' });
  }, [hunk, diffLayout, selected?.path]);

  const at = selected ? order.findIndex((f) => f.path === selected.path) : -1;
  const goFile = (step: 1 | -1, then: Pending = null) => {
    const to = order[at + step];
    if (to) select(to.path, then);
  };
  const goHunk = (step: 1 | -1) => {
    const next = hunk === null ? (step === 1 ? 0 : starts.length - 1) : hunk + step;
    if (next >= 0 && next < starts.length) setHunk(next);
    else goFile(step, step === 1 ? 'first' : 'last');
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (event.metaKey || event.ctrlKey || event.altKey || target.closest('input, textarea, [contenteditable="true"]')) return;
    const key = event.key;
    if (key === 'j' || key === 'k') goHunk(key === 'j' ? 1 : -1);
    else if (key === 'n' || key === 'p') goFile(key === 'n' ? 1 : -1, 'first');
    else if (key === '/') filterBox.current?.focus();
    else return;
    event.preventDefault();
  };

  const additions = all?.reduce((n, f) => n + f.additions, 0) ?? 0;
  const deletions = all?.reduce((n, f) => n + f.deletions, 0) ?? 0;
  // An agent by its name; a project's lead is the project.
  const [project, who] = fileRef.split('/');
  const name = !who || who === T.LeadName ? project : who;

  return (
    // Focusable, so a click on the diff, which has nothing to focus, keeps the
    // keys here rather than on the dialog around it.
    <div className="flex min-h-0 flex-1 flex-col outline-none" tabIndex={-1} onKeyDown={onKeyDown} data-changes-layout={diffLayout}>
      <header className="flex min-w-0 shrink-0 items-center gap-3 border-b border-line-faint py-2.5 pl-4 pr-14">
        <GitCompare className="size-4 shrink-0 text-brand-300" />
        <DialogTitle className="flex min-w-0 items-baseline gap-2 text-[15px] font-semibold tracking-tight text-title">
          {t('changes.title')}
          <span className="min-w-0 truncate text-[12.5px] font-normal text-subtle">
            {changes.data ? t('changes.summary', { name, count: changes.data.files.length, base: changes.data.base }) : name}
          </span>
        </DialogTitle>
        {all && all.length > 0 && (
          <span className="shrink-0 font-mono text-[12px]" data-changes-total>
            <span className="text-emerald-400">+{additions}</span> <span className="text-rose-400">−{deletions}</span>
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <NavButton label={t('changes.prevChange')} keys="K" disabled={!selected} onClick={() => goHunk(-1)} data-changes-prev-hunk>
            <ChevronUp />
          </NavButton>
          <NavButton label={t('changes.nextChange')} keys="J" disabled={!selected} onClick={() => goHunk(1)} data-changes-next-hunk>
            <ChevronDown />
          </NavButton>
          <NavButton label={t('changes.prevFile')} keys="P" disabled={at <= 0} onClick={() => goFile(-1, 'first')} data-changes-prev-file>
            <FileUp />
          </NavButton>
          <NavButton label={t('changes.nextFile')} keys="N" disabled={at < 0 || at >= order.length - 1} onClick={() => goFile(1, 'first')} data-changes-next-file>
            <FileDown />
          </NavButton>
          <LayoutToggle value={diffLayout} onChange={setChangesLayout} />
        </div>
      </header>

      {changes.error && <Notice className="mx-4 mt-3">{t('changes.failed', { error: errorMessage(changes.error) })}</Notice>}
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-80 shrink-0 flex-col border-r border-line-faint" aria-label={t('changes.files')} data-changes-tree>
          <div className="shrink-0 border-b border-line-faint p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <input
                ref={filterBox}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && filter) {
                    setFilter('');
                  } else if (event.key === 'Enter' && order[0]) {
                    select(order[0].path, 'first');
                    filterBox.current?.blur();
                  }
                }}
                placeholder={t('changes.filter')}
                aria-label={t('changes.filter')}
                className="h-7 w-full rounded-md border border-line bg-well pl-7 pr-2 text-[12.5px] text-primary outline-none placeholder:text-faint focus:border-brand-400/50"
                data-changes-filter
              />
            </div>
          </div>
          <div
            ref={treeBox}
            className="min-h-0 flex-1 overflow-y-auto py-1"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              event.preventDefault();
              const to = order[Math.min(order.length - 1, Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)))];
              if (to) select(to.path);
            }}
          >
            {changes.isPending && <p className="px-3 py-2 text-[12.5px] text-subtle">{t('common.loading')}</p>}
            {all && files.length === 0 && <p className="px-3 py-2 text-[12.5px] text-subtle">{all.length ? t('changes.noMatch') : t('changes.none', { base: changes.data!.base })}</p>}
            <ChangeTree
              nodes={tree}
              depth={0}
              selected={selected?.path}
              folded={folded}
              onSelect={(p) => select(p)}
              onFold={(p) => setFolded((s) => toggled(s, p))}
              tintModified
              aside={(f) => <FileCounts file={f} />}
              folderAside={(p) => {
                const sum = sums.get(p);
                return sum && <Counts additions={sum.additions} deletions={sum.deletions} faint />;
              }}
            />
            {changes.data?.truncated && <p className="px-3 py-2 text-[11.5px] text-faint">{t('changes.truncated')}</p>}
          </div>
        </nav>

        <div ref={pane} className="min-w-0 flex-1 overflow-auto bg-well" data-changes-diff={selected?.path}>
          {selected ? (
            <FileDiff
              key={selected.path}
              file={selected}
              sides={sides.data?.path === selected.path ? sides.data : undefined}
              error={sides.error}
              rows={sides.data?.path === selected.path ? rows : null}
              starts={starts}
              hunk={hunk}
              diffLayout={diffLayout}
            />
          ) : (
            all &&
            all.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-[13px] text-subtle" data-changes-empty>
                <GitCompare className="size-7 text-faint" />
                {t('changes.none', { base: changes.data!.base })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

const toggled = (set: ReadonlySet<string>, key: string) => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

function Counts({ additions, deletions, faint }: { additions: number; deletions: number; faint?: boolean }) {
  return (
    <span className={cn('ml-auto flex shrink-0 gap-1 pl-2 font-mono text-[10.5px]', faint && 'opacity-70')}>
      {additions > 0 && <span className="text-emerald-400">+{additions}</span>}
      {deletions > 0 && <span className="text-rose-400">−{deletions}</span>}
    </span>
  );
}

// FileCounts ends a file's row: its lines added and removed, and its letter.
function FileCounts({ file }: { file: T.WorktreeChange }) {
  const t = useT();
  return (
    <>
      {file.binary ? <span className="ml-auto pl-2 text-[10.5px] text-faint">{t('changes.binaryShort')}</span> : <Counts additions={file.additions} deletions={file.deletions} />}
      <span className={cn('w-3 shrink-0 text-center font-mono text-[11px] font-semibold', !file.binary && file.additions + file.deletions === 0 && 'ml-auto', badgeTints[file.status])} title={t(`changes.status.${file.status as 'modified'}`)} data-change-badge={badges[file.status]}>
        {badges[file.status] ?? '?'}
      </span>
    </>
  );
}

function NavButton({ label, keys, disabled, onClick, children, ...rest }: { label: string; keys: string; disabled?: boolean; onClick: () => void; children: ReactNode } & Record<`data-${string}`, boolean>) {
  return (
    <Tip label={`${label}  ${keys}`}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="flex size-7 items-center justify-center rounded-md text-subtle transition hover:bg-surface-raised hover:text-primary disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4"
        {...rest}
      >
        {children}
      </button>
    </Tip>
  );
}

function LayoutToggle({ value, onChange }: { value: DiffLayout; onChange: (v: DiffLayout) => void }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t('changes.layout')} className="ml-2 flex items-center gap-0.5 rounded-lg border border-line p-0.5">
      {(
        [
          ['unified', Rows2, 'changes.layout.unified'],
          ['split', Columns2, 'changes.layout.split'],
        ] as const
      ).map(([v, Icon, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          data-changes-layout-option={v}
          onClick={() => onChange(v)}
          className={cn(
            'flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted transition-colors hover:text-primary',
            value === v && 'bg-surface-strong text-title',
          )}
        >
          <Icon className="size-3.5" />
          <span className="hidden md:inline">{t(label)}</span>
        </button>
      ))}
    </div>
  );
}

// FileDiff is the picked file: what happened to it, and its diff with the
// unchanged stretches folded.
function FileDiff({
  file,
  sides,
  error,
  rows,
  starts,
  hunk,
  diffLayout,
}: {
  file: T.WorktreeChange;
  sides?: T.FileSides;
  error: Error | null;
  rows: DiffRow[] | null;
  starts: number[];
  hunk: number | null;
  diffLayout: DiffLayout;
}) {
  const t = useT();
  const [shown, setShown] = useState<Shown>(new Map());
  const lang = languageOfPath(file.path);
  const fits = (text?: string) => (text !== undefined && text.length <= highlightLimit ? text : undefined);
  const oldTokens = useTokens(fits(sides?.oldText), lang);
  const newTokens = useTokens(fits(sides?.newText), lang);
  const marked = useMemo(() => (rows ? wordsOf(rows) : new Map()), [rows]);
  const items = useMemo(() => (rows ? layout(rows, shown) : []), [rows, shown]);
  const changed = rows?.some((r) => r.sign !== ' ');

  let body: ReactNode;
  if (error) body = <Notice className="m-4">{t('changes.diffFailed', { error: errorMessage(error) })}</Notice>;
  else if (!sides) body = <p className="px-4 py-3 text-[12.5px] text-subtle">{t('common.loading')}</p>;
  else if (sides.binary) body = <p className="px-4 py-3 text-[12.5px] text-subtle">{t('changes.binary')}</p>;
  else if (sides.tooLarge) body = <p className="px-4 py-3 text-[12.5px] text-subtle">{t('changes.tooLarge')}</p>;
  else if (rows && !changed) body = <p className="px-4 py-3 text-[12.5px] text-subtle">{file.status === 'renamed' ? t('changes.renamedOnly') : t('changes.noLineChanges')}</p>;
  else if (rows) {
    const props = { rows, items, words: marked, starts, hunk, oldTokens, newTokens, onFold: (fold: Fold, how: 'up' | 'down' | 'all') => setShown((s) => openFold(s, fold, how)) };
    body = diffLayout === 'split' ? <SplitTable {...props} /> : <UnifiedTable {...props} />;
  }

  return (
    <div className="min-w-0" data-changes-file={file.path}>
      <div className="sticky top-0 z-10 flex min-w-0 items-center gap-2 border-b border-line-faint bg-modal px-4 py-2 text-[12.5px]">
        <span className={cn('font-mono text-[11px] font-semibold', badgeTints[file.status])}>{badges[file.status]}</span>
        <span className="min-w-0 truncate font-mono text-secondary" title={file.path}>
          {file.path}
        </span>
        {file.previousPath && <span className="hidden min-w-0 truncate font-mono text-faint sm:inline">{t('pulls.detail.renamedFrom', { path: file.previousPath })}</span>}
        <span className="shrink-0 text-faint">{t(`changes.status.${file.status as 'modified'}`)}</span>
        {starts.length > 0 && (
          <span className="ml-auto shrink-0 text-[11.5px] text-faint" data-changes-hunk-count>
            {hunk === null ? t('changes.hunks', { count: starts.length }) : t('changes.hunkOf', { at: hunk + 1, count: starts.length })}
          </span>
        )}
        <span className={cn('shrink-0 font-mono text-[11.5px]', starts.length === 0 && 'ml-auto')}>
          <span className="text-emerald-400">+{file.additions}</span> <span className="text-rose-400">−{file.deletions}</span>
        </span>
      </div>
      {body}
    </div>
  );
}

type TableProps = {
  rows: DiffRow[];
  items: Item[];
  words: Words;
  starts: number[];
  hunk: number | null;
  oldTokens: ThemedToken[][] | null;
  newTokens: ThemedToken[][] | null;
  onFold: (fold: Fold, how: 'up' | 'down' | 'all') => void;
};

const rowTints = { '+': 'bg-emerald-500/10', '-': 'bg-rose-500/10', ' ': '' } as const;
const gutterTints = { '+': 'bg-emerald-500/15', '-': 'bg-rose-500/15', ' ': '' } as const;
const signs = { '+': '+', '-': '−', ' ': ' ' } as const;
const num = 'w-[1%] select-none whitespace-nowrap px-2 text-right align-top text-faint';
// The gutter of the change j/k is on: in the brand's colour, with a bar.
const currentGutter = '!bg-brand-400/25 !text-secondary';
const currentBar = 'shadow-[inset_3px_0_0_var(--ab-brand-400)]';

// tokensOf is a row's highlighted tokens, from its side's file.
function tokensOf(row: DiffRow, oldTokens: ThemedToken[][] | null, newTokens: ThemedToken[][] | null) {
  return row.sign === '-' ? oldTokens?.[row.old! - 1] : newTokens?.[row.new! - 1];
}

// hunkAt says which hunk a row starts, for navigation to find it.
function useHunkIndex(starts: number[]) {
  return useMemo(() => new Map(starts.map((s, i) => [s, i])), [starts]);
}

function UnifiedTable({ rows, items, words, starts, hunk, oldTokens, newTokens, onFold }: TableProps) {
  const hunkAt = useHunkIndex(starts);
  const current = hunk === null ? null : [starts[hunk], starts[hunk + 1] ?? rows.length];
  return (
    <table className="w-full border-collapse font-mono text-[12px] leading-[1.6]" data-diff-table="unified">
      <tbody>
        {items.map((item) => {
          if (item.kind === 'fold') return <FoldRow key={`f${item.fold.id}`} item={item} total={rows.length} colSpan={4} onFold={onFold} />;
          const row = rows[item.index];
          const inCurrent = current && item.index >= current[0] && item.index < current[1] && row.sign !== ' ';
          return (
            <tr key={item.index} className={rowTints[row.sign]} data-hunk={hunkAt.get(item.index)} data-sign={row.sign}>
              <td className={cn(num, gutterTints[row.sign], inCurrent && [currentGutter, currentBar])}>{row.old ?? ''}</td>
              <td className={cn(num, gutterTints[row.sign], inCurrent && currentGutter)}>{row.new ?? ''}</td>
              <td className="w-4 select-none align-top text-subtle">{signs[row.sign]}</td>
              <td className="whitespace-pre pr-4 text-tertiary">
                <Code text={row.text} tokens={tokensOf(row, oldTokens, newTokens)} ranges={words.get(item.index)} side={row.sign === '-' ? 'del' : 'add'} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SplitTable({ rows, items, words, starts, hunk, oldTokens, newTokens, onFold }: TableProps) {
  const hunkAt = useHunkIndex(starts);
  const pairs: SplitItem[] = useMemo(() => split(rows, items), [rows, items]);
  const current = hunk === null ? null : [starts[hunk], starts[hunk + 1] ?? rows.length];
  const side = (index: number | undefined, which: 'left' | 'right') => {
    if (index === undefined) {
      return (
        <>
          <td className={cn(num, 'bg-surface-faint')} />
          <td className={cn('bg-surface-faint', which === 'left' && 'border-r border-line-faint')} />
        </>
      );
    }
    const row = rows[index];
    // An unchanged row is on both sides: each shows its own number.
    const n = row.sign === ' ' ? (which === 'left' ? row.old : row.new) : (row.old ?? row.new);
    const inCurrent = current && index >= current[0] && index < current[1] && row.sign !== ' ';
    return (
      <>
        <td className={cn(num, gutterTints[row.sign], inCurrent && currentGutter, inCurrent && which === 'left' && currentBar)}>{n}</td>
        <td className={cn('whitespace-pre-wrap pr-3 [overflow-wrap:anywhere] pl-1 align-top text-tertiary', rowTints[row.sign], which === 'left' && 'border-r border-line-faint')} data-sign={row.sign}>
          <Code text={row.text} tokens={tokensOf(row, oldTokens, newTokens)} ranges={words.get(index)} side={row.sign === '-' ? 'del' : 'add'} />
        </td>
      </>
    );
  };
  return (
    <table className="w-full table-fixed border-collapse font-mono text-[12px] leading-[1.6]" data-diff-table="split">
      <colgroup>
        <col className="w-12" />
        <col />
        <col className="w-12" />
        <col />
      </colgroup>
      <tbody>
        {pairs.map((pair, i) => {
          if (pair.kind === 'fold') return <FoldRow key={`f${pair.fold.id}`} item={pair} total={rows.length} colSpan={4} onFold={onFold} />;
          const first = [pair.left, pair.right].map((x) => (x === undefined ? undefined : hunkAt.get(x))).find((x) => x !== undefined);
          return (
            <tr key={i} data-hunk={first}>
              {side(pair.left, 'left')}
              {side(pair.right, 'right')}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// FoldRow is an unchanged stretch folded away: a click shows it all, the
// arrows a step of it from either end.
function FoldRow({ item, total, colSpan, onFold }: { item: { fold: Fold; hidden: number; first: number }; total: number; colSpan: number; onFold: (fold: Fold, how: 'up' | 'down' | 'all') => void }) {
  const t = useT();
  // The file's first stretch only grows up from the change below it, its last
  // only down from the change above.
  const atTop = item.fold.start === 0;
  const atBottom = item.fold.end === total;
  return (
    <tr className="bg-sky-500/[0.07] text-subtle" data-fold={item.fold.id}>
      <td colSpan={colSpan} className="p-0">
        <div className="flex items-center gap-1 px-2 py-0.5 font-sans text-[11.5px]">
          {item.hidden > foldStep && !atTop && (
            <FoldButton label={t('changes.fold.down')} onClick={() => onFold(item.fold, 'down')}>
              <ChevronDown className="size-3.5" />
            </FoldButton>
          )}
          {item.hidden > foldStep && !atBottom && (
            <FoldButton label={t('changes.fold.up')} onClick={() => onFold(item.fold, 'up')}>
              <ChevronUp className="size-3.5" />
            </FoldButton>
          )}
          <button type="button" onClick={() => onFold(item.fold, 'all')} className="flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-surface-raised hover:text-primary" data-fold-all>
            <ChevronsDownUp className="size-3.5" />
            {t('changes.fold.show', { count: item.hidden })}
          </button>
        </div>
      </td>
    </tr>
  );
}

function FoldButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tip label={label}>
      <button type="button" aria-label={label} onClick={onClick} className="flex size-5 items-center justify-center rounded hover:bg-surface-raised hover:text-primary">
        {children}
      </button>
    </Tip>
  );
}
