// Co-located Angular-driven test (ADR 0025) for ScreenOrientationService. See network's
// network-state.service.test.ts for the shared rationale.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import { ScreenOrientationService } from './index';

type IScreenOrientationState = { orientation: number; orientationLock: number };
type IOrientationChangeEvent = {
  orientationLock: number;
  orientationInfo: { orientation: number };
};

const addListenerMock = vi.fn();
const removeMock = vi.fn();
const getOrientationAsyncMock = vi.fn(async () => 1);
const getOrientationLockAsyncMock = vi.fn(async () => 0);

vi.mock('../../../core', () => ({
  addOrientationChangeListener: (listener: (event: IOrientationChangeEvent) => void) =>
    addListenerMock(listener),
  getOrientationAsync: () => getOrientationAsyncMock(),
  getOrientationLockAsync: () => getOrientationLockAsyncMock(),
  Orientation: { UNKNOWN: 0, PORTRAIT_UP: 1 },
  OrientationLock: { UNKNOWN: 9, DEFAULT: 0 },
}));

const ROOT_TAG = 974;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let capturedResult: Signal<IScreenOrientationState> | undefined;
let capturedListener: ((event: IOrientationChangeEvent) => void) | undefined;

@Component({
  selector: 'symbiote-screen-orientation-host',
  standalone: true,
  template: '',
})
class ScreenOrientationHost {
  readonly screenOrientation = inject(ScreenOrientationService).connect();

  constructor() {
    capturedResult = this.screenOrientation;
  }
}

beforeEach(() => {
  capturedResult = undefined;
  capturedListener = undefined;
  getOrientationAsyncMock.mockResolvedValue(1);
  getOrientationLockAsyncMock.mockResolvedValue(0);
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

// This layer owns ONLY Angular lifecycle wiring over core (effect → fetch + subscribe, onCleanup
// → unsubscribe) — core's own validation/platform-branch logic is exhaustively covered by
// screen-orientation.test.ts and must not be re-asserted here. No Negative group: connect() has
// no guard clause of its own — it has nothing to throw, only a signal to keep in sync with core.
describe('ScreenOrientationService.connect', () => {
  // why: a caller reads the signal before the async initial fetch settles — connect() must
  // expose a real, documented UNKNOWN state rather than `undefined`/a stale value during that
  // window
  it('reports Orientation/OrientationLock UNKNOWN before the initial fetch resolves', async () => {
    mount(ROOT_TAG, ScreenOrientationHost);

    expect(capturedResult?.()).toEqual({ orientation: 0, orientationLock: 9 });
  });

  // why: connect() must actually apply the values core's one-shot getters resolve to, not just
  // call them
  it('reports the fetched state once getOrientationAsync()/getOrientationLockAsync() resolve', async () => {
    mount(ROOT_TAG, ScreenOrientationHost);
    await tick();

    expect(capturedResult?.()).toEqual({ orientation: 1, orientationLock: 0 });
  });

  // why: the whole point of subscribing inside the effect is staying in sync with device
  // rotation after the initial read — a signal that only reflects the one-shot fetch would go
  // stale immediately
  it('updates the signal when the registered listener fires', async () => {
    mount(ROOT_TAG, ScreenOrientationHost);
    await tick();

    if (capturedListener === undefined) throw new Error('addListener callback was not captured');
    capturedListener({ orientationLock: 5, orientationInfo: { orientation: 3 } });

    expect(capturedResult?.()).toEqual({ orientation: 3, orientationLock: 5 });
  });

  // why: a destroyed host must not keep a live native subscription — the effect's onCleanup is
  // the only thing standing between component teardown and a leaked listener
  it('removes the subscription when the host component is unmounted', async () => {
    mount(ROOT_TAG, ScreenOrientationHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });
});
