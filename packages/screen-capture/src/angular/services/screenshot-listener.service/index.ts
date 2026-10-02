// Angular twin of `../../react`'s `useScreenshotListener`, `connect()` shape matching
// `@symbiote-native/keep-awake`'s own `KeepAwakeService`

import { effect, inject, Injectable, Injector } from '@angular/core';
import { addScreenshotListener } from '../../../core';

@Injectable({ providedIn: 'root' })
export class ScreenshotListenerService {
  private readonly injector = inject(Injector);

  connect(listener: () => void): void {
    effect(
      onCleanup => {
        const subscription = addScreenshotListener(listener);
        onCleanup(() => {
          subscription.remove();
        });
      },
      { injector: this.injector },
    );
  }
}
