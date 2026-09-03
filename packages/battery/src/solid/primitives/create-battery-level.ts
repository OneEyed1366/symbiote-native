// Solid lifecycle wiring over the framework-agnostic core (core/battery.ts) — the twin of
// react/hooks/use-battery-level, vue/composables/use-battery-level and
// svelte/runes/use-battery-level.svelte. See adapters/solid/src/primitives/create-color-scheme.ts
// for why the bucket is `primitives/` and the name is `create*` rather than `use*`.
//
// Returns an ACCESSOR, never a snapshot: a Solid component body runs ONCE, so a returned number
// would freeze at the level the screen mounted with.
//
// The listener is registered SYNCHRONOUSLY with the body — there is no useEffect/onMounted twin
// to defer it to, so nothing can arrive before the subscription exists. The seed stays a promise,
// which leaves one ordering hazard the React and Vue versions both have and neither guards: a
// native event can land BEFORE getBatteryLevelAsync() resolves, and the late seed would then
// overwrite the fresher reading with an older one. `hasNativeReading` drops the seed in that case
// — these two writers are ordered by latency, not by time, so last-write-wins is wrong here.
import { createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  addBatteryLevelListener,
  getBatteryLevelAsync,
  type EventSubscription,
} from '../../core';

// core/battery.ts's documented sentinel for "no reading yet / this device cannot report a level".
const UNKNOWN_BATTERY_LEVEL = -1;

export function createBatteryLevel(): Accessor<number> {
  const [batteryLevel, setBatteryLevel] = createSignal(UNKNOWN_BATTERY_LEVEL);
  let hasNativeReading = false;

  const subscription: EventSubscription = addBatteryLevelListener(event => {
    hasNativeReading = true;
    setBatteryLevel(event.batteryLevel);
  });

  getBatteryLevelAsync().then(level => {
    if (!hasNativeReading) {
      setBatteryLevel(level);
    }
  });

  onCleanup(() => {
    subscription.remove();
  });

  return batteryLevel;
}
