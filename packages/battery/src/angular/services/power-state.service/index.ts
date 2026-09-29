import { inject, Injectable, Injector, type Signal } from '@angular/core';
import { connectWatchedSignal } from '@symbiote-native/angular';
import {
  initialPowerState,
  watchPowerState,
  type PowerState,
} from '../../../core';

// Angular twin of `usePowerState`, same `connect()` pattern as `BatteryLevelService`
@Injectable({ providedIn: 'root' })
export class PowerStateService {
  private readonly injector = inject(Injector);

  connect(): Signal<PowerState> {
    return connectWatchedSignal(
      this.injector,
      initialPowerState,
      watchPowerState,
    );
  }
}
