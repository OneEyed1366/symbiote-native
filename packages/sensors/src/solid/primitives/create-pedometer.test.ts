// Co-located Solid-driven test (ADR 0025) for createPedometer, the Solid twin of
// react/hooks/use-pedometer, vue/composables/use-pedometer and
// svelte/runes/use-pedometer.svelte.ts. Same coverage as the Vue file — seed, listener-driven
// update, replace-not-accumulate, teardown — plus the synchronous subscribe that only this
// adapter guarantees.
//
// Driven with `createRoot` + an explicit dispose rather than a mounted component: the primitive
// renders nothing, so a root is the whole owner it needs. The core module is mocked wholesale
// (never expo-modules-core internals) — `getStepCountAsync`/`isAvailableAsync`/the permission
// pair are core-level surface covered by core/pedometer.test.ts. Unlike every other sensor here
// Pedometer has no `setUpdateInterval`, so there is no interval group at all.
//
// No Negative group: the primitive has no guard clause and nothing to reject — it always forwards
// its listener straight into `watchStepCount`.

import { createEffect, createRoot, type Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPedometerResult } from '../../core';
import { createPedometer } from './create-pedometer';

type IListener = (result: IPedometerResult) => void;

let registeredListener: IListener | undefined;
// remove() clears the captured listener, exactly as the real subscription does — otherwise the
// "stops moving after dispose" assertion below could never fail.
const removeMock = vi.fn(() => {
  registeredListener = undefined;
});
const watchStepCountMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});

vi.mock('../../core', () => ({
  watchStepCount: (listener: IListener) => watchStepCountMock(listener),
}));

// A user `createEffect` is deferred to the end of the enclosing `runUpdates`, so one created
// inside `createRoot`'s callback has not run when that callback returns — every test therefore
// builds inside the root and asserts outside it, the same ordering a component gets.
function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

let disposeRoot: (() => void) | undefined;

function buildPedometer(): Accessor<IPedometerResult | null> {
  const { value, dispose } = inRoot(createPedometer);
  disposeRoot = dispose;
  return value;
}

beforeEach(() => {
  registeredListener = undefined;
  watchStepCountMock.mockClear();
  removeMock.mockClear();
});

afterEach(() => {
  disposeRoot?.();
  disposeRoot = undefined;
});

describe('createPedometer (Solid)', () => {
  describe('Positive', () => {
    it('starts null before any step count arrives', () => {
      // why: the caller has no reading synchronously at build time — null is the documented
      // "nothing reported yet" state, not an error.
      const result = buildPedometer();

      expect(result()).toBeNull();
    });

    it('subscribes synchronously in the primitive body, not from a deferred effect', () => {
      // why: Solid defers user effects to the end of the enclosing update, so a subscription
      // created there would miss a step event landing between the seed and the flush — the same
      // seed/subscribe race React's useEffect and Vue's onMounted both carry.
      let hasSubscribedDuringBuild = false;
      const { dispose } = inRoot(() => {
        createPedometer();
        hasSubscribedDuringBuild = watchStepCountMock.mock.calls.length === 1;
      });
      disposeRoot = dispose;

      expect(hasSubscribedDuringBuild).toBe(true);
    });

    it('updates the accessor when the native listener fires', () => {
      // why: the primitive's whole job is bridging the native step-count stream into Solid
      // reactivity, and reading it from a tracked scope proves it — a value that only updated
      // when polled would never re-run a consumer's effect.
      const seen: (IPedometerResult | null)[] = [];
      const { value: result, dispose } = inRoot(() => {
        const steps = createPedometer();
        createEffect(() => {
          seen.push(steps());
        });
        return steps;
      });
      disposeRoot = dispose;

      registeredListener?.({ steps: 456 });

      expect(result()).toEqual({ steps: 456 });
      expect(seen).toEqual([null, { steps: 456 }]);
    });

    it('replaces the previous result rather than accumulating step counts client-side', () => {
      // why: the native module already reports the running total (Pedometer's own "steps" is
      // cumulative) — a client-side merge/add would double-count.
      const result = buildPedometer();

      registeredListener?.({ steps: 10 });
      expect(result()).toEqual({ steps: 10 });
      registeredListener?.({ steps: 25 });

      expect(result()).toEqual({ steps: 25 });
    });

    it('removes the subscription on dispose', () => {
      // why: a leftover subscription keeps writing into a disposed scope and pins the native
      // listener alive for no consumer. Asserting the accessor stops moving catches a `remove`
      // that silently no-ops; asserting `remove` was called does not.
      const result = buildPedometer();
      registeredListener?.({ steps: 10 });

      disposeRoot?.();
      disposeRoot = undefined;

      expect(removeMock).toHaveBeenCalledTimes(1);
      expect(registeredListener).toBeUndefined();
      expect(result()).toEqual({ steps: 10 });
    });
  });
});
