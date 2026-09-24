// Svelte lifecycle wiring over the framework-agnostic core (core/asset.ts). Loads once per
// mount ($effect with no read of its own state), matching upstream's useAssets contract.
import { Asset } from '../../core';

export function useAssets(moduleIds: number | number[]): {
  readonly assets: Asset[] | undefined;
  readonly error: Error | undefined;
} {
  let assets = $state<Asset[] | undefined>(undefined);
  let error = $state<Error | undefined>(undefined);

  $effect(() => {
    Asset.loadAsync(moduleIds)
      .then(loaded => {
        assets = loaded;
      })
      .catch((err: Error) => {
        error = err;
      });
  });

  return {
    get assets(): Asset[] | undefined {
      return assets;
    },
    get error(): Error | undefined {
      return error;
    },
  };
}
