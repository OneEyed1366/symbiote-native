// React lifecycle wiring over the framework-agnostic core (core/font.ts). Loads once on mount
// (upstream's own contract: a changed font map is not reloaded — see FontHooks.ts's
// useRuntimeFonts), seeded synchronously so an already-loaded font never flashes unloaded.
import { useEffect, useState } from 'react';
import {
  isFontMapLoaded,
  loadAsync,
  type FontSource,
  type UseFontsResult,
} from '../../../core';

export function useFonts(
  map: string | Record<string, FontSource>,
): UseFontsResult {
  const [loaded, setLoaded] = useState(() => isFontMapLoaded(map));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    loadAsync(map)
      .then(() => {
        if (isMounted) setLoaded(true);
      })
      .catch((err: Error) => {
        if (isMounted) setError(err);
      });
    return () => {
      isMounted = false;
    };
    // Loads once on mount only — a later change to `map` is deliberately not reloaded,
    // matching upstream's own useFonts contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [loaded, error];
}
