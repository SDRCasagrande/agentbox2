import { Globe } from 'lucide-react';
import { connectorPresets, presetForURL } from '../lib/connectors';
import { cn } from '../lib/utils';

// PresetMark is a letter, not the company's logo: the app ships no one else's
// artwork. Hatch is the exception, being ours: an egg with a crack through it.
function PresetMark({ id }: { id: string }) {
  if (id === 'hatch') {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 1.8c2.6 0 4.6 3.4 4.6 6.4a4.6 4.6 0 0 1-9.2 0C3.4 5.2 5.4 1.8 8 1.8Z" />
        <path d="m4 8.4 1.8 1.4L8 7.8l2.2 2L12 8.4" />
      </svg>
    );
  }
  return <span className="font-semibold">{connectorPresets.find((p) => p.id === id)?.label[0]}</span>;
}

// The tile a mark sits on, in three sizes: sm beside a line of text (a
// request in a chat), md on a catalog tile or a connector's card, lg for a
// page's empty state.
const tiles = {
  sm: 'size-5 rounded-[6px] text-[10px] [&_svg]:size-3',
  md: 'size-9 rounded-[10px] text-[14px] [&_svg]:size-[18px]',
  lg: 'size-11 rounded-xl text-[16px] [&_svg]:size-[22px]',
};

// ConnectorMark is a connector's mark on its tile: the preset's for a server
// the catalog knows, by its URL (a connector named "notion" elsewhere isn't
// Notion), and a globe for any other.
export function ConnectorMark({ url, preset, size = 'md', className }: { url?: string; preset?: string; size?: keyof typeof tiles; className?: string }) {
  const id = preset ?? (url ? presetForURL(url)?.id : undefined);
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center bg-surface text-secondary ring-1 ring-inset ring-line',
        tiles[size],
        className,
      )}
      aria-hidden="true"
    >
      {id && connectorPresets.some((p) => p.id === id) ? <PresetMark id={id} /> : <Globe strokeWidth={1.75} />}
    </span>
  );
}
