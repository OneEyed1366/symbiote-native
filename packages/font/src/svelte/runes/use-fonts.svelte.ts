// Svelte lifecycle wiring over the framework-agnostic core (core/font.ts). Loads once per
// mount, matching upstream's own useFonts contract (a changed font map is not reloaded).
import { isFontMapLoaded, loadAsync, type FontSource } from '../../core';

export function useFonts(map: string | Record<string, FontSource>): {
  readonly loaded: boolean;
  readonly error: Error | null;
} {
  let loaded = $state(isFontMapLoaded(map));
  let error = $state<Error | null>(null);

  $effect(() => {
    loadAsync(map)
      .then(() => {
        loaded = true;
      })
      .catch((err: Error) => {
        error = err;
      });
  });

  return {
    get loaded(): boolean {
      return loaded;
    },
    get error(): Error | null {
      return error;
    },
  };
}
