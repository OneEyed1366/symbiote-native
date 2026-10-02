// Angular twin of `../../react`'s `usePreventScreenCapture`, `connect()` shape matching
// `@symbiote-native/keep-awake`'s own `KeepAwakeService`

import { effect, inject, Injectable, Injector } from '@angular/core';
import {
  allowScreenCaptureAsync,
  preventScreenCaptureAsync,
} from '../../../core';

@Injectable({ providedIn: 'root' })
export class PreventScreenCaptureService {
  private readonly injector = inject(Injector);

  connect(key: string = 'default'): void {
    effect(
      onCleanup => {
        preventScreenCaptureAsync(key);
        onCleanup(() => {
          allowScreenCaptureAsync(key);
        });
      },
      { injector: this.injector },
    );
  }
}
