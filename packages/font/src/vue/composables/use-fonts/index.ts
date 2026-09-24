// Vue lifecycle wiring over the framework-agnostic core (core/font.ts). Loads once on mount,
// matching upstream's own useFonts contract (a changed font map prop is not reloaded).
import { onMounted, ref, type Ref } from '@vue/runtime-core';
import { isFontMapLoaded, loadAsync, type FontSource } from '../../../core';

export function useFonts(map: string | Record<string, FontSource>): {
  loaded: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const loaded = ref(isFontMapLoaded(map));
  const error = ref<Error | null>(null);

  onMounted(() => {
    loadAsync(map)
      .then(() => {
        loaded.value = true;
      })
      .catch((err: Error) => {
        error.value = err;
      });
  });

  return { loaded, error };
}
