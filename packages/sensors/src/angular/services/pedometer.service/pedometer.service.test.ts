// Co-located Angular-driven test (ADR 0025) for PedometerService. Mounts a real host component
// through @symbiote-native/angular so `connect()` runs the same way an app would call it —
// inside the component's own injection context — and drives the returned signal through a full
// mount/unmount lifecycle, because `effect()`'s injector-scoped cleanup only fires correctly
// when torn down through a real Angular injection context.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import type { IPedometerResult } from '../../../core';
import { PedometerService } from './index';

const watchStepCountMock = vi.fn();
const removeMock = vi.fn();

vi.mock('../../../core', () => ({
  watchStepCount: (listener: (result: IPedometerResult) => void) =>
    watchStepCountMock(listener),
}));

const ROOT_TAG = 942;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const RESULT: IPedometerResult = { steps: 789 };

let capturedResult: Signal<IPedometerResult | null> | undefined;
let capturedListener: ((result: IPedometerResult) => void) | undefined;

@Component({
  selector: 'symbiote-pedometer-host',
  standalone: true,
  template: '',
})
class PedometerHost {
  readonly result = inject(PedometerService).connect();

  constructor() {
    capturedResult = this.result;
  }
}

beforeEach(() => {
  capturedResult = undefined;
  capturedListener = undefined;
  watchStepCountMock.mockImplementation(listener => {
    capturedListener = listener;
    return { remove: removeMock };
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.clearAllMocks();
});

// connect() never rejects or throws — it returns a signal synchronously and reports failures
// (if any) through watchStepCount's own event stream, not through connect() itself. So there is
// no Negative group here; every scenario below is Positive. Unlike every other sensor service,
// PedometerService.connect() takes NO interval param — Pedometer wraps free functions with no
// setUpdateInterval (see pedometer.ts's own top-of-file comment) — so the
// updateIntervalMs/zero-interval boundary tests the other seven services carry are N/A here by
// design, not an oversight.
describe('PedometerService.connect', () => {
  describe('Positive (expected to succeed without an error)', () => {
    it('reports null before any step count event fires', async () => {
      // why: the template reads `result()?.steps` — the signal must start at a value that
      // optional-chains safely, so the UI doesn't render a stale or fabricated step count.
      mount(ROOT_TAG, PedometerHost);
      await tick();

      expect(capturedResult?.()).toBeNull();
    });

    it('updates the signal when the registered listener fires with a result', async () => {
      // why: this is the entire point of connect() — bridge watchStepCount's event stream into
      // a signal a template can read reactively.
      mount(ROOT_TAG, PedometerHost);
      await tick();

      if (capturedListener === undefined)
        throw new Error('watchStepCount callback was not captured');
      capturedListener(RESULT);

      expect(capturedResult?.()).toEqual(RESULT);
    });

    it('removes the subscription when the host component is unmounted', async () => {
      // why: an Angular service is `providedIn: 'root'` (a singleton) — if the effect's
      // subscription outlived the component, every remount would stack another native listener.
      mount(ROOT_TAG, PedometerHost);
      await tick();

      unmount(ROOT_TAG);
      await tick();

      expect(removeMock).toHaveBeenCalledOnce();
    });
  });
});
