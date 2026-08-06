import { effect, inject, Injectable, Injector, signal, type Signal } from '@angular/core';
import { addLowPowerModeListener, isLowPowerModeEnabledAsync } from '../../../core';

// Angular twin of React's `useLowPowerMode` hook and Vue's `useLowPowerMode` composable. See
// BatteryLevelService for the `connect()` pattern rationale.
//
//   readonly lowPowerMode = inject(LowPowerModeService).connect();
//   // template: {{ lowPowerMode() }}
@Injectable({ providedIn: 'root' })
export class LowPowerModeService {
  private readonly injector = inject(Injector);

  connect(): Signal<boolean> {
    const lowPowerMode = signal(false);

    effect(
      onCleanup => {
        isLowPowerModeEnabledAsync().then(enabled => lowPowerMode.set(enabled));
        const subscription = addLowPowerModeListener(event => lowPowerMode.set(event.lowPowerMode));
        onCleanup(() => subscription.remove());
      },
      { injector: this.injector },
    );

    return lowPowerMode.asReadonly();
  }
}
