import { effect, inject, Injectable, Injector, signal, type Signal } from '@angular/core';
import { watchStepCount, type IPedometerResult } from '../../../core';

// Angular twin of React's `usePedometer` hook / Vue's `usePedometer` composable. Angular has no
// per-instance hook, so `connect()` stands in: call it ONCE, inside an injection context
// (typically a component's field initializer). Pedometer has no setUpdateInterval, unlike the
// other sensor services, so there is no interval param here.
//
//   readonly result = inject(PedometerService).connect();
//   // template: {{ result()?.steps }}
@Injectable({ providedIn: 'root' })
export class PedometerService {
  // Captured in the constructor (always an injection context) so `connect()` can build an
  // `effect()` even when called from a field initializer that isn't one on its own.
  private readonly injector = inject(Injector);

  connect(): Signal<IPedometerResult | null> {
    const result = signal<IPedometerResult | null>(null);

    effect(
      onCleanup => {
        const subscription = watchStepCount(next => result.set(next));
        onCleanup(() => subscription.remove());
      },
      { injector: this.injector },
    );

    return result.asReadonly();
  }
}
