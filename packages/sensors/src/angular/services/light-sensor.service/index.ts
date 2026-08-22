import {
  effect,
  inject,
  Injectable,
  Injector,
  signal,
  type Signal,
} from '@angular/core';
import { LightSensor, type ILightSensorMeasurement } from '../../../core';

// Angular twin of React's `useLightSensor` hook / Vue's `useLightSensor` composable. Angular
// has no per-instance hook, so `connect()` stands in: call it ONCE, inside an injection context
// (typically a component's field initializer).
//
//   readonly measurement = inject(LightSensorService).connect();
//   // template: {{ measurement()?.illuminance }}
@Injectable({ providedIn: 'root' })
export class LightSensorService {
  // Captured in the constructor (always an injection context) so `connect()` can build an
  // `effect()` even when called from a field initializer that isn't one on its own.
  private readonly injector = inject(Injector);

  connect(updateIntervalMs?: number): Signal<ILightSensorMeasurement | null> {
    const measurement = signal<ILightSensorMeasurement | null>(null);

    effect(
      onCleanup => {
        // updateIntervalMs applies once, at connect time — the effect has no reactive read to
        // re-run on, so a later change is not picked up.
        if (updateIntervalMs !== undefined) {
          LightSensor.setUpdateInterval(updateIntervalMs);
        }
        const subscription = LightSensor.addListener(next =>
          measurement.set(next),
        );
        onCleanup(() => subscription.remove());
      },
      { injector: this.injector },
    );

    return measurement.asReadonly();
  }
}
