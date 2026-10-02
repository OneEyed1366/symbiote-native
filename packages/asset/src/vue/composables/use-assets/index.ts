// Vue lifecycle wiring over the framework-agnostic core (core/asset.ts). Loads once on mount,
// matching upstream's own useAssets contract (a changed moduleIds prop is not reloaded).
import {
  onMounted,
  ref,
  shallowRef,
  type Ref,
  type ShallowRef,
} from '@vue/runtime-core';
import { Asset } from '../../../core';

export function useAssets(moduleIds: number | number[]): {
  assets: ShallowRef<Asset[] | undefined>;
  error: Ref<Error | undefined>;
} {
  const assets = shallowRef<Asset[]>();
  const error = ref<Error>();

  onMounted(() => {
    Asset.loadAsync(moduleIds)
      .then(loaded => {
        assets.value = loaded;
      })
      .catch((err: Error) => {
        error.value = err;
      });
  });

  return { assets, error };
}
