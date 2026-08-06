import { effect, inject, Injectable, Injector } from '@angular/core';
import {
  activateKeepAwakeAsync,
  addListener,
  deactivateKeepAwake,
  type KeepAwakeOptions,
} from '../../../core';

// Angular twin of React's `useKeepAwake` hook and Vue's `useKeepAwake` composable. See
// LowPowerModeService (packages/battery) for the `connect()`/`effect()` pattern rationale — same
// wiring, but keep-awake has no value to surface as a Signal since it's a pure side effect for
// the component's lifetime. Angular has no useId equivalent either, so the default tag comes
// from the same monotonically-incrementing module-local counter the Vue composable uses.
//
//   constructor() { inject(KeepAwakeService).connect(); }
let tagCounter = 0;

@Injectable({ providedIn: 'root' })
export class KeepAwakeService {
  private readonly injector = inject(Injector);

  connect(tag?: string, options?: KeepAwakeOptions): void {
    const tagOrDefault = tag ?? `keep-awake-tag-${++tagCounter}`;

    effect(
      onCleanup => {
        activateKeepAwakeAsync(tagOrDefault)
          .then(() => {
            if (options?.listener) {
              addListener(tagOrDefault, options.listener);
            }
          })
          .catch(() => {});

        onCleanup(() => {
          if (options?.suppressDeactivateWarnings) {
            deactivateKeepAwake(tagOrDefault).catch(() => {});
          } else {
            deactivateKeepAwake(tagOrDefault);
          }
        });
      },
      { injector: this.injector },
    );
  }
}
