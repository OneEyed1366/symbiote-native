// React lifecycle wiring over the framework-agnostic core (core/asset.ts). Loads once on mount;
// upstream's own contract ("the assets are not reloaded when you dynamically change the asset
// list") is preserved by the empty dependency array.
import { useEffect, useState } from 'react';
import { Asset } from '../../../core';

export function useAssets(
  moduleIds: number | number[],
): [Asset[] | undefined, Error | undefined] {
  const [assets, setAssets] = useState<Asset[]>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    Asset.loadAsync(moduleIds).then(setAssets).catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [assets, error];
}
