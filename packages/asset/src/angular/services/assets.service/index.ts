import { Injectable, signal, type Signal } from '@angular/core';
import { Asset } from '../../../core';

// Angular twin of React's useAssets hook and Vue's useAssets composable — connect(ids) returns
// a Signal pair, e.g. `readonly assets = inject(AssetsService).connect([require('./a.jpg')])`.
@Injectable({ providedIn: 'root' })
export class AssetsService {
  connect(moduleIds: number | number[]): {
    assets: Signal<Asset[] | undefined>;
    error: Signal<Error | undefined>;
  } {
    const assets = signal<Asset[] | undefined>(undefined);
    const error = signal<Error | undefined>(undefined);

    Asset.loadAsync(moduleIds)
      .then(loaded => assets.set(loaded))
      .catch((err: Error) => error.set(err));

    return { assets: assets.asReadonly(), error: error.asReadonly() };
  }
}
