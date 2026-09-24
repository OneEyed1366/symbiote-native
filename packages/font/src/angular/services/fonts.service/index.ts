import { Injectable, signal, type Signal } from '@angular/core';
import { isFontMapLoaded, loadAsync, type FontSource } from '../../../core';

// Angular twin of React's useFonts hook and Vue's useFonts composable — connect(map) returns
// a Signal pair, e.g. `readonly fonts = inject(FontsService).connect({ Inter: require('...') })`.
@Injectable({ providedIn: 'root' })
export class FontsService {
  connect(map: string | Record<string, FontSource>): {
    loaded: Signal<boolean>;
    error: Signal<Error | null>;
  } {
    const loaded = signal(isFontMapLoaded(map));
    const error = signal<Error | null>(null);

    loadAsync(map)
      .then(() => loaded.set(true))
      .catch((err: Error) => error.set(err));

    return { loaded: loaded.asReadonly(), error: error.asReadonly() };
  }
}
