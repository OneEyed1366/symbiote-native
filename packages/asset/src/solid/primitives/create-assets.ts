// createAssets — the Solid twin of React's useAssets hook, over the framework-agnostic core
// (core/asset.ts). Loads once from the primitive body, matching upstream's own contract.
import { createSignal, type Accessor } from 'solid-js';
import { Asset } from '../../core';

export function createAssets(moduleIds: number | number[]): {
  assets: Accessor<Asset[] | undefined>;
  error: Accessor<Error | undefined>;
} {
  const [assets, setAssets] = createSignal<Asset[] | undefined>(undefined);
  const [error, setError] = createSignal<Error | undefined>(undefined);

  Asset.loadAsync(moduleIds).then(setAssets).catch(setError);

  return { assets, error };
}
