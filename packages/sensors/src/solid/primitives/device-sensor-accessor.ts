// The one lifecycle body every DeviceSensor-shaped primitive in this folder delegates to
// (Accelerometer, Barometer, DeviceMotion, Gyroscope, LightSensor, Magnetometer,
// MagnetometerUncalibrated). Internal — not re-exported from ../index.ts, whose surface stays at
// parity with the react/vue/svelte entries.
//
// `primitives/` and `create*`, never `hooks/` + `use*`: Solid's ecosystem calls a composable
// reactive function a PRIMITIVE and reserves `use*` for consuming something that already exists.
// Full rationale in adapters/solid/src/primitives/create-color-scheme.ts.
//
// Returns an ACCESSOR, never a snapshot: a Solid component body runs ONCE, so a returned
// measurement would pin the caller to `null` forever.
//
// ## Why the interval is `number | Accessor<number | undefined>`
//
// React re-reads `updateIntervalMs` on every render and re-runs its effect when it changes; Vue
// and Svelte read it once at subscribe time. Neither shape ports: a Solid body runs once, so a
// plain parameter freezes the sample rate at whatever the caller passed at mount, and nothing
// reports it — the caller's `intervalMs` state moves and the native rate does not. So the
// parameter accepts EITHER form (solid-primitives' `MaybeAccessor` convention): a literal for the
// common static case, keeping the call site identical to the other adapters, or an accessor when
// the rate is derived from state. The accessor form is the reactive one and is the only one that
// creates an effect.
//
// Applying it splits in two on purpose. The mount-time value is applied SYNCHRONOUSLY, before
// `addListener`, so the very first native sample already arrives at the requested rate; the
// tracking effect is then `defer`red so it fires only on a LATER change. Without the defer the
// interval would be set twice at mount, and the second call would land a tick after the first
// samples.
//
// Outside a component or `createRoot` there is no owner for `onCleanup` — Solid warns and the
// native listener lives for the process. The accessor still tracks; only the teardown is lost.

import {
  createEffect,
  createSignal,
  on,
  onCleanup,
  untrack,
  type Accessor,
} from 'solid-js';
import type { EventSubscription, IListener } from '../../core';

export type IUpdateIntervalMs =
  number | Accessor<number | undefined> | undefined;

// Structural, not `DeviceSensor<Measurement>`: this needs exactly two methods, and every test in
// this folder passes a plain object in place of the singleton.
type ISensorHandle<Measurement> = {
  addListener(listener: IListener<Measurement>): EventSubscription;
  setUpdateInterval(intervalMs: number): void;
};

export function createDeviceSensorAccessor<Measurement>(
  sensor: ISensorHandle<Measurement>,
  updateIntervalMs?: IUpdateIntervalMs,
): Accessor<Measurement | null> {
  const [measurement, setMeasurement] = createSignal<Measurement | null>(null);

  function applyInterval(intervalMs: number | undefined): void {
    // `!== undefined`, not truthiness: 0 is a legitimate "as fast as possible" rate, and an
    // unconditional call would stomp the rate another consumer of this shared singleton set.
    if (intervalMs !== undefined) {
      sensor.setUpdateInterval(intervalMs);
    }
  }

  // untracked: a primitive built inside a tracked scope must not re-run — and re-subscribe —
  // just because it read the caller's interval accessor once.
  applyInterval(
    untrack(() =>
      typeof updateIntervalMs === 'function'
        ? updateIntervalMs()
        : updateIntervalMs,
    ),
  );

  // Subscribed from the primitive body, not from an effect: React/Vue/Svelte start listening a
  // tick after their seed runs, so an event landing in that window is lost. Both statements here
  // run in one synchronous tick and nothing can interleave.
  const subscription: EventSubscription = sensor.addListener(next => {
    // The updater form, because `Measurement` is unconstrained — a bare value would be read as a
    // reducer for any measurement type that could itself be callable.
    setMeasurement(() => next);
  });

  onCleanup(() => {
    subscription.remove();
  });

  if (typeof updateIntervalMs === 'function') {
    // Only the rate changes — the native listener is per-sensor and unaffected, so re-subscribing
    // (as React's interval-keyed effect does) would drop events for nothing.
    createEffect(
      on(
        updateIntervalMs,
        intervalMs => {
          applyInterval(intervalMs);
        },
        { defer: true },
      ),
    );
  }

  return measurement;
}
