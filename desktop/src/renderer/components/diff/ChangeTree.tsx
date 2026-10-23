import { ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TreeNode } from '../../lib/pulls';
import { cn } from '../../lib/utils';

// The tint of a file's icon by what happened to it: GitHub's statuses (a pull
// request's files) and the worktree's (the Changes view).
export const statusTints: Record<string, string> = {
  added: 'text-emerald-400',
  untracked: 'text-emerald-400',
  removed: 'text-rose-400',
  deleted: 'text-rose-400',
  renamed: 'text-sky-400',
  modified: 'text-amber-400',
};
const gone = new Set(['removed', 'deleted']);

// ChangeTree is changed files as folders, one picked: a pull request's files
// and the Changes view's. aside draws what a file's row ends with, folderAside
// a folder's; without them a row is its name.
export function ChangeTree<F extends { path: string; status: string }>({
  nodes,
  depth,
  selected,
  folded,
  onSelect,
  onFold,
  aside,
  folderAside,
  tintModified = false,
}: {
  nodes: TreeNode<F>[];
  depth: number;
  selected?: string;
  folded: ReadonlySet<string>;
  onSelect: (path: string) => void;
  onFold: (path: string) => void;
  aside?: (file: F) => ReactNode;
  folderAside?: (path: string) => ReactNode;
  // tintModified gives a modified file's icon a colour too, as an editor does.
  tintModified?: boolean;
}) {
  const indent = { paddingLeft: `${0.75 + depth * 0.85}rem` };
  return (
    <ul>
      {nodes.map((node) =>
        node.kind === 'dir' ? (
          <li key={`d:${node.path}`}>
            <button
              type="button"
              style={indent}
              onClick={() => onFold(node.path)}
              className="flex w-full min-w-0 items-center gap-1.5 py-1 pr-3 text-left text-[12.5px] text-muted hover:bg-surface-raised hover:text-primary"
              title={node.path}
              data-tree-dir={node.path}
            >
              <ChevronRight className={cn('size-3 shrink-0 transition-transform', !folded.has(node.path) && 'rotate-90')} />
              {folded.has(node.path) ? <Folder className="size-3.5 shrink-0" /> : <FolderOpen className="size-3.5 shrink-0" />}
              <span className="min-w-0 truncate">{node.name}</span>
              {folderAside?.(node.path)}
            </button>
            {!folded.has(node.path) && (
              <ChangeTree
                nodes={node.children}
                depth={depth + 1}
                selected={selected}
                folded={folded}
                onSelect={onSelect}
                onFold={onFold}
                aside={aside}
                folderAside={folderAside}
                tintModified={tintModified}
              />
            )}
          </li>
        ) : (
          <li key={`f:${node.file.path}`}>
            <button
              type="button"
              style={{ paddingLeft: `${0.75 + depth * 0.85 + 1.125}rem` }}
              onClick={() => onSelect(node.file.path)}
              data-tree-file={node.file.path}
              aria-current={node.file.path === selected || undefined}
              className={cn(
                'flex w-full min-w-0 items-center gap-1.5 py-1 pr-3 text-left text-[12.5px] text-secondary hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand-400',
                node.file.path === selected && 'bg-surface-strong text-title',
              )}
              title={node.file.path}
            >
              <FileText className={cn('size-3.5 shrink-0', ((tintModified || node.file.status !== 'modified') && statusTints[node.file.status]) || 'text-subtle')} />
              <span className={cn('min-w-0 truncate', gone.has(node.file.status) && 'line-through decoration-rose-400/60')}>{node.name}</span>
              {aside?.(node.file)}
            </button>
          </li>
        ),
      )}
    </ul>
  );
}
