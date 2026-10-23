import { useEffect, useState } from 'react';
import type { ThemedToken } from 'shiki/core';
import { highlight } from '../../lib/highlight';
import { useMode } from '../../lib/theme';

// useTokens highlights code as lang, a line of tokens per line, again when the
// theme turns over; null until it has, or when there is no language.
export function useTokens(code: string | undefined, lang: string | undefined): ThemedToken[][] | null {
  const mode = useMode();
  const [out, setOut] = useState<{ code: string; mode: string; tokens: ThemedToken[][] } | null>(null);
  useEffect(() => {
    if (!lang || code === undefined) return;
    let current = true;
    highlight(code, lang)
      .then((tokens) => current && setOut({ code, mode, tokens }))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [code, lang, mode]);
  return out && out.code === code && out.mode === mode ? out.tokens : null;
}
