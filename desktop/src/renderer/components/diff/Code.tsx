import type { ThemedToken } from 'shiki/core';
import { paint, type Range } from '../../lib/changes';
import { cn } from '../../lib/utils';

// Code is one line of a diff, in its highlighted tokens' colours once they
// have loaded, its changed words (ranges) marked in the tint of its side.
export function Code({ text, tokens, ranges, side }: { text: string; tokens?: ThemedToken[]; ranges?: readonly Range[]; side?: 'add' | 'del' }) {
  return (
    <>
      {paint(text, tokens, ranges).map((piece, i) => (
        <span
          key={i}
          style={{ color: piece.color, fontStyle: piece.italic ? 'italic' : undefined }}
          className={cn(piece.changed && 'rounded-[2px]', piece.changed && (side === 'del' ? 'bg-rose-500/30 [[data-appearance=light]_&]:bg-rose-500/45' : 'bg-emerald-500/30 [[data-appearance=light]_&]:bg-emerald-500/45'))}
          data-word={piece.changed || undefined}
        >
          {piece.text}
        </span>
      ))}
    </>
  );
}
