// Co-located Angular-driven test (ADR 0025) for BatteryLevelService. Mounts a real host
// component through @symbiote-native/angular so `connect()` runs the same way an app would call
// it — inside the component's own injection context — and drives the returned signal through a
// full mount/unmount lifecycle, because `effect()`'s injector-scoped cleanup only fires
// correctly when torn down through a real Angular injection context.
//
// `core` is mocked wholesale: the real getBatteryLevelAsync/addBatteryLevelListener delegation
// (fallback sentinel, native event name) already has its own coverage in
// packages/battery/src/core/battery.test.ts — this file proves only connect()'s OWN lifecycle
// (seed → subscribe → react to events → unsubscribe on teardown), not the native wiring again.
//
// No Negative group: connect() has no guard clause or throwing path — it always returns a
// signal, seeded and updated per the effect below.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import { BatteryLevelService } from './index';

const addListenerMock = vi.fn();
const removeMock = vi.fn();
const getBatteryLevelAsyncMock = vi.fn(async () => 0.42);

vi.mock('../../../core', () => ({
  addBatteryLevelListener: (
    listener: (event: { batteryLevel: number }) => void,
  ) => addListenerMock(listener),
  getBatteryLevelAsync: () => getBatteryLevelAsyncMock(),
}));

const ROOT_TAG = 971;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedResult: Signal<number> | undefined;
let capturedListener: ((event: { batteryLevel: number }) => void) | undefined;

@Component({
  selector: 'symbiote-battery-level-host',
  standalone: true,
  template: '',
})
class BatteryLevelHost {
  readonly batteryLevel = inject(BatteryLevelService).connect();

  constructor() {
    capturedResult = this.batteryLevel;
  }
}

beforeEach(() => {
  capturedResult = undefined;
  capturedListener = undefined;
  getBatteryLevelAsyncMock.mockResolvedValue(0.42);
  addListenerMock.mockImplementation(listener => {
    capturedListener = listener;
    return { remove: removeMock };
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.clearAllMocks();
});

describe('BatteryLevelService.connect', () => {
  it('reports -1 before the initial fetch resolves', async () => {
    // why: -1 is the documented "unknown yet" sentinel (core/battery.test.ts) — the signal must
    // show it immediately on mount, before the async seed fetch settles, so a template bound to
    // it never reads `undefined`.
    mount(ROOT_TAG, BatteryLevelHost);

    expect(capturedResult?.()).toBe(-1);
  });

  it('reports the fetched level once getBatteryLevelAsync() resolves', async () => {
    // why: connect() seeds the signal with a one-shot fetch in addition to subscribing — proves
    // that seed actually reaches the signal, not just the listener path below.
    mount(ROOT_TAG, BatteryLevelHost);
    await tick();

    expect(capturedResult?.()).toBe(0.42);
  });

  it('updates the signal when the registered listener fires', async () => {
    // why: after the initial seed, live updates must come from the native event, not another
    // fetch — proves the listener registered by connect() is actually wired to the signal.
    mount(ROOT_TAG, BatteryLevelHost);
    await tick();

    if (capturedListener === undefined)
      throw new Error('addListener callback was not captured');
    capturedListener({ batteryLevel: 0.1 });

    expect(capturedResult?.()).toBe(0.1);
  });

  it('removes the subscription when the host component is unmounted', async () => {
    // why: an Angular effect's onCleanup only runs through a real injection-context teardown
    // (per this file's header) — a leaked subscription here would keep updating a signal no
    // component reads anymore, and would leak the native listener itself.
    mount(ROOT_TAG, BatteryLevelHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });
});
