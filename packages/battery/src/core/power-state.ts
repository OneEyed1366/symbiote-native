// Shared half of upstream's `usePowerState`: level, state and low-power mode as one merged value
import {
  addBatteryLevelListener,
  addBatteryStateListener,
  addLowPowerModeListener,
  getBatteryLevelAsync,
  getBatteryStateAsync,
  isLowPowerModeEnabledAsync,
} from './battery';
import { BatteryState, type PowerState } from './types';

export const initialPowerState: PowerState = {
  lowPowerMode: false,
  batteryLevel: -1,
  batteryState: BatteryState.UNKNOWN,
};

// Seeds each field with a one-shot fetch, then follows native events; returns the teardown
export function watchPowerState(
  onChange: (state: PowerState) => void,
): () => void {
  let state = initialPowerState;
  let isStopped = false;
  const heardFields = new Set<keyof PowerState>();

  // A native event that lands before its seed resolves wins because the seed is the older value
  function write<K extends keyof PowerState>(
    key: K,
    value: PowerState[K],
    isSeed: boolean,
  ): void {
    if (isStopped || (isSeed && heardFields.has(key))) {
      return;
    }
    if (!isSeed) {
      heardFields.add(key);
    }
    state = { ...state, [key]: value };
    onChange(state);
  }

  const subscriptions = [
    addLowPowerModeListener(event =>
      write('lowPowerMode', event.lowPowerMode, false),
    ),
    addBatteryLevelListener(event =>
      write('batteryLevel', event.batteryLevel, false),
    ),
    addBatteryStateListener(event =>
      write('batteryState', event.batteryState, false),
    ),
  ];
  isLowPowerModeEnabledAsync().then(value =>
    write('lowPowerMode', value, true),
  );
  getBatteryLevelAsync().then(value => write('batteryLevel', value, true));
  getBatteryStateAsync().then(value => write('batteryState', value, true));

  return () => {
    isStopped = true;
    subscriptions.forEach(subscription => subscription.remove());
  };
}
