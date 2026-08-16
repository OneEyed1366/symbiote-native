// Co-located React-driven test (ADR 0025) for useBatteryLevel. Mocks the whole `core` module
// rather than expo-modules-core internals — this hook's own lifecycle wiring (initial fetch +
// subscribe/unsubscribe) is what's under test, not the core port itself, which already has its
// own coverage in packages/battery/src/core/battery.test.ts.
//
// No Negative group: the hook has no guard clause or throwing path — it always returns a number,
// seeded and updated per the effect below.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { useBatteryLevel } from './index';

const { addListener, getBatteryLevelAsync, remove } = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    addListener: vi.fn((_listener: (event: { batteryLevel: number }) => void) => ({ remove })),
    getBatteryLevelAsync: vi.fn(async () => 0.42),
    remove,
  };
});

vi.mock('../../../core', () => ({ addBatteryLevelListener: addListener, getBatteryLevelAsync }));

const ROOT_TAG = 951;

const results: number[] = [];

function Probe(): ReactElement {
  results.push(useBatteryLevel());
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
  getBatteryLevelAsync.mockResolvedValue(0.42);
});

afterEach(() => unmount(ROOT_TAG));

describe('useBatteryLevel', () => {
  it('reports -1 before the initial fetch resolves', () => {
    // why: -1 is the documented "unknown yet" sentinel (core/battery.test.ts) — useState's
    // initial value must show it on the synchronous first render, before the effect's async
    // fetch has any chance to settle.
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toBe(-1);
  });

  it('reports the fetched level once the initial getBatteryLevelAsync() resolves', async () => {
    // why: the effect seeds state with a one-shot fetch in addition to subscribing — proves
    // that seed actually reaches a re-render, not just the listener path below.
    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() => expect(results[results.length - 1]).toBe(0.42));
  });

  it('updates when the native listener fires', async () => {
    // why: after the initial seed, live updates must come from the native event, not another
    // fetch — proves the listener registered in the effect actually drives a re-render.
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() => expect(results[results.length - 1]).toBe(0.42));

    const listener = addListener.mock.calls[0][0];
    listener({ batteryLevel: 0.1 });

    await vi.waitFor(() => expect(results[results.length - 1]).toBe(0.1));
  });

  it('unsubscribes from the native listener on unmount', () => {
    // why: the effect's cleanup function must run on unmount, or the native listener (and any
    // native-side resource it holds) leaks past the component's lifetime.
    mount(ROOT_TAG, createElement(Probe));

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
