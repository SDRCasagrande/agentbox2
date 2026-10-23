import { Globe } from 'lucide-react';
import { presetForURL } from '../lib/connectors';
import { cn } from '../lib/utils';

// The catalog's brand marks, one colour (currentColor) on a 24×24 box, so a
// mark follows the text around it in either appearance. Notion, Linear,
// Sentry and Figma are Simple Icons' (simpleicons.org, CC0), copied here: the
// page's CSP is 'self', so nothing is fetched. Hatch is ours: an egg with a
// crack through it, drawn as the two halves of its shell.
const marks: Record<string, string> = {
  notion:
    'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z',
  linear:
    'M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z',
  sentry:
    'M13.91 2.505c-.873-1.448-2.972-1.448-3.844 0L6.904 7.92a15.478 15.478 0 0 1 8.53 12.811h-2.221A13.301 13.301 0 0 0 5.784 9.814l-2.926 5.06a7.65 7.65 0 0 1 4.435 5.848H2.194a.365.365 0 0 1-.298-.534l1.413-2.402a5.16 5.16 0 0 0-1.614-.913L.296 19.275a2.182 2.182 0 0 0 .812 2.999 2.24 2.24 0 0 0 1.086.288h6.983a9.322 9.322 0 0 0-3.845-8.318l1.11-1.922a11.47 11.47 0 0 1 4.95 10.24h5.915a17.242 17.242 0 0 0-7.885-15.28l2.244-3.845a.37.37 0 0 1 .504-.13c.255.14 9.75 16.708 9.928 16.9a.365.365 0 0 1-.327.543h-2.287c.029.612.029 1.223 0 1.831h2.297a2.206 2.206 0 0 0 1.922-3.31z',
  figma:
    'M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148zm7.704 0h-.098c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h.098c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-.097-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z',
  hatch:
    'M4.5 12.75C4.5 7.5 7.8 1.5 12 1.5s7.5 6 7.5 11.25L16.5 15 12 11.6 7.5 15ZM4.72 14.55 7.5 16.8l4.5-3.4 4.5 3.4 2.78-2.25A7.5 7.5 0 0 1 4.72 14.55Z',
};

export const hasBrandMark = (id: string) => id in marks;

export function BrandMark({ id, className }: { id: string; className?: string }) {
  const d = marks[id];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn('size-4 shrink-0', className)} aria-hidden="true" data-brand-mark={id}>
      <path d={d} />
    </svg>
  );
}

// The tile a mark sits on, in three sizes: sm beside a line of text (a
// request in a chat), md on a catalog tile or a connector's card, lg for a
// page's empty state.
const tiles = {
  sm: 'size-5 rounded-[6px] [&_svg]:size-3',
  md: 'size-9 rounded-[10px] [&_svg]:size-[18px]',
  lg: 'size-11 rounded-xl [&_svg]:size-[22px]',
};

// ConnectorMark is a connector's mark on its tile: the brand's for a server
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
      {id && hasBrandMark(id) ? <BrandMark id={id} /> : <Globe strokeWidth={1.75} />}
    </span>
  );
}
