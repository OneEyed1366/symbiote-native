import { effect, inject, Injectable, Injector, signal, type Signal } from '@angular/core';
import { addBatteryLevelListener, getBatteryLevelAsync } from '../../../core';

// Angular twin of React's `useBatteryLevel` hook and Vue's `useBatteryLevel` composable.
// Angular has no per-instance hook — state and lifecycle live in DI instead, so `connect()`
// stands in for the hook's role: call it ONCE (typically from a component's field initializer,
// inside an injection context).
//
//   readonly batteryLevel = inject(BatteryLevelService).connect();
//   // template: {{ batteryLevel() }}
//
// Mirrors AccelerometerService.connect() — a single effect() that seeds the initial value with
// getBatteryLevelAsync(), subscribes once, and cleans up once.
@Injectable({ providedIn: 'root' })
export class BatteryLevelService {
  private readonly injector = inject(Injector);

  connect(): Signal<number> {
    const batteryLevel = signal(-1);

    effect(
      onCleanup => {
        getBatteryLevelAsync().then(level => batteryLevel.set(level));
        const subscription = addBatteryLevelListener(event => batteryLevel.set(event.batteryLevel));
        onCleanup(() => subscription.remove());
      },
      { injector: this.injector },
    );

    return batteryLevel.asReadonly();
  }
}
