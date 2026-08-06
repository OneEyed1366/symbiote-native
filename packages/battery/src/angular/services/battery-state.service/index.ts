import { effect, inject, Injectable, Injector, signal, type Signal } from '@angular/core';
import { addBatteryStateListener, BatteryState, getBatteryStateAsync } from '../../../core';

// Angular twin of React's `useBatteryState` hook and Vue's `useBatteryState` composable. See
// BatteryLevelService for the `connect()` pattern rationale.
//
//   readonly batteryState = inject(BatteryStateService).connect();
//   // template: {{ batteryState() }}
@Injectable({ providedIn: 'root' })
export class BatteryStateService {
  private readonly injector = inject(Injector);

  connect(): Signal<BatteryState> {
    const batteryState = signal<BatteryState>(BatteryState.UNKNOWN);

    effect(
      onCleanup => {
        getBatteryStateAsync().then(state => batteryState.set(state));
        const subscription = addBatteryStateListener(event => batteryState.set(event.batteryState));
        onCleanup(() => subscription.remove());
      },
      { injector: this.injector },
    );

    return batteryState.asReadonly();
  }
}
