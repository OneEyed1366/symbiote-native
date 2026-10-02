// Angular twin of `../../../react`'s `useLastNotificationResponse`, `connect()` shape combining
// `PermissionsService`'s signal return with `ScreenshotListenerService`'s effect+injector cleanup

import {
  effect,
  Injectable,
  Injector,
  signal,
  inject,
  type Signal,
} from '@angular/core';
import {
  addNotificationResponseClearedListener,
  addNotificationResponseReceivedListener,
  determineNextResponse,
  getLastNotificationResponse,
} from '../../../core';
import type { IMaybeNotificationResponse } from '../../../core';

@Injectable({ providedIn: 'root' })
export class LastNotificationResponseService {
  private readonly injector = inject(Injector);
  private readonly lastResponse = signal<IMaybeNotificationResponse>(undefined);
  private isConnected = false;

  connect(): Signal<IMaybeNotificationResponse> {
    if (!this.isConnected) {
      this.isConnected = true;
      effect(
        onCleanup => {
          this.lastResponse.update(prev =>
            determineNextResponse(prev, getLastNotificationResponse()),
          );

          const subscription = addNotificationResponseReceivedListener(next => {
            this.lastResponse.update(prev => determineNextResponse(prev, next));
          });
          const clearedSubscription = addNotificationResponseClearedListener(
            () => {
              this.lastResponse.set(null);
            },
          );

          onCleanup(() => {
            subscription.remove();
            clearedSubscription.remove();
          });
        },
        { injector: this.injector },
      );
    }
    return this.lastResponse.asReadonly();
  }
}
