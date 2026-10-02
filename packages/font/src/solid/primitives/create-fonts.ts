// createFonts — the Solid twin of React's useFonts hook, over the framework-agnostic core
// (core/font.ts). Loads once from the primitive body, matching upstream's own contract.
import { createSignal, type Accessor } from 'solid-js';
import { isFontMapLoaded, loadAsync, type FontSource } from '../../core';

export function createFonts(map: string | Record<string, FontSource>): {
  loaded: Accessor<boolean>;
  error: Accessor<Error | null>;
} {
  const [loaded, setLoaded] = createSignal(isFontMapLoaded(map));
  const [error, setError] = createSignal<Error | null>(null);

  loadAsync(map)
    .then(() => setLoaded(true))
    .catch(setError);

  return { loaded, error };
}
