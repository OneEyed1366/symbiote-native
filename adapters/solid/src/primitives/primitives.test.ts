// Co-located tests for the Solid reactive primitives over the engine's runtime modules.
// Both are driven through the REAL event source: a fake `__turboModuleProxy` supplies the
// Appearance / DeviceInfo native modules and a fake `RN$registerCallableModule` captures the
// device hub, so a test plays "native" and emits `appearanceChanged` / `didUpdateDimensions`
// exactly as the platform does. Nothing about Appearance or Dimensions is stubbed — a primitive
// that never subscribed would read its seed value forever and fail here.
//
// What each primitive owns, and therefore what is asserted: (1) the accessor tracks the module
// after the seed read, (2) `onCleanup` actually removes the subscription — proven by an emit
// AFTER dispose leaving the accessor untouched, not by spying on `remove` being called, and
// (3) the documented behaviour with no owner (outside a component / `createRoot`), where Solid
// has nothing to attach the cleanup to. The subscribe/cache/notify contract of the engine
// modules themselves is covered in core/engine/src/{appearance,dimensions}/*.test.ts and is not
// duplicated here.

import { createEffect, createRoot, type Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IColorSchemeName,
  IDimensionsPayload,
  IDisplayMetrics,
} from '@symbiote-native/engine';

import { createColorScheme } from './create-color-scheme';
import { createWindowDimensions } from './create-window-dimensions';

// ---- fake native modules + device hub -----------------------------------

let nativeScheme: IColorSchemeName = 'light';
const fakeAppearance = {
  getColorScheme: (): IColorSchemeName => nativeScheme,
  setColorScheme: (scheme: IColorSchemeName | 'unspecified'): void => {
    if (scheme !== 'unspecified') nativeScheme = scheme;
  },
  addListener: (): void => {},
  removeListeners: (): void => {},
};

const INITIAL_WINDOW: IDisplayMetrics = {
  width: 390,
  height: 844,
  scale: 3,
  fontScale: 1,
};
const fakeDeviceInfo = {
  getConstants: (): { Dimensions: IDimensionsPayload } => ({
    Dimensions: { window: INITIAL_WINDOW, screen: INITIAL_WINDOW },
  }),
};

const registeredModules: Record<string, unknown> = {
  Appearance: fakeAppearance,
  DeviceInfo: fakeDeviceInfo,
};

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let deviceHub: IDeviceHub | undefined;

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

Object.assign(globalThis, {
  __turboModuleProxy: <T>(name: string): T | null => {
    const module = registeredModules[name];
    if (!isType<T>(module)) return null;
    return module;
  },
  RN$registerCallableModule: (
    name: string,
    factory: () => IDeviceHub,
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  },
});

// Play native. Throws rather than silently no-opping: a missing hub would make every
// "the accessor updated" assertion pass for the wrong reason.
function emitDeviceEvent(eventType: string, payload: unknown): void {
  if (deviceHub === undefined) {
    throw new Error('device event hub was never installed');
  }
  deviceHub.emit(eventType, payload);
}

function emitWindow(window: IDisplayMetrics, screen = window): void {
  emitDeviceEvent('didUpdateDimensions', { window, screen });
}

// `createEffect` is a USER effect: Solid defers it to the end of the enclosing `runUpdates`, so
// one created inside `createRoot`'s callback has not run yet when that callback returns a value.
// Every test therefore builds inside the root and asserts OUTSIDE it — the same ordering a
// component gets, where effects flush after the render pass. (`createRenderEffect` would run
// inline, but it is the wrong primitive for a subscription consumer.)
function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

beforeEach(() => {
  nativeScheme = 'light';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createColorScheme', () => {
  // why: a Solid component body runs ONCE, so a primitive that returned a snapshot would pin the
  // app to the scheme it booted with and no test of the initial value could tell the difference.
  it('seeds from Appearance and tracks a native appearanceChanged event', () => {
    const seen: (IColorSchemeName | null)[] = [];
    const { value: colorScheme, dispose } = inRoot<
      Accessor<IColorSchemeName | null>
    >(() => {
      const scheme = createColorScheme();
      createEffect(() => {
        seen.push(scheme());
      });
      return scheme;
    });

    expect(colorScheme()).toBe('light');

    emitDeviceEvent('appearanceChanged', { colorScheme: 'dark' });

    expect(colorScheme()).toBe('dark');
    // The accessor is read from a tracked scope too, not just imperatively: a value that only
    // updates when polled would not re-run a consumer's effect.
    expect(seen).toEqual(['light', 'dark']);

    dispose();
  });

  // why: an Appearance listener that outlives its owner is a real leak — the component is gone and
  // the callback still writes into a disposed scope. Asserting `remove` was CALLED would pass on a
  // subscription object that ignores it; asserting the accessor stops moving cannot.
  it('unsubscribes on dispose', () => {
    const { value: colorScheme, dispose } = inRoot(createColorScheme);

    emitDeviceEvent('appearanceChanged', { colorScheme: 'dark' });
    expect(colorScheme()).toBe('dark');

    dispose();

    emitDeviceEvent('appearanceChanged', { colorScheme: 'light' });
    expect(colorScheme()).toBe('dark');
  });

  // why: pins the documented no-owner behaviour so it is a choice, not a surprise — Solid has
  // nothing to hang `onCleanup` on outside a component / createRoot, so the primitive still works
  // and the subscription is permanent. A future change that made it throw or go inert instead
  // would break callers silently.
  it('still tracks outside a root, and leaks its subscription there', () => {
    const colorScheme = createColorScheme();

    emitDeviceEvent('appearanceChanged', { colorScheme: 'dark' });
    expect(colorScheme()).toBe('dark');

    // No owner means no dispose to call — the only observable is that it keeps updating forever.
    emitDeviceEvent('appearanceChanged', { colorScheme: 'light' });
    expect(colorScheme()).toBe('light');
  });
});

describe('createWindowDimensions', () => {
  it('seeds from Dimensions and tracks a native didUpdateDimensions event', () => {
    const widths: number[] = [];
    const { value: dimensions, dispose } = inRoot<Accessor<IDisplayMetrics>>(
      () => {
        const metrics = createWindowDimensions();
        createEffect(() => {
          widths.push(metrics().width);
        });
        return metrics;
      },
    );

    expect(dimensions()).toEqual(INITIAL_WINDOW);

    const rotated: IDisplayMetrics = {
      width: 844,
      height: 390,
      scale: 3,
      fontScale: 1,
    };
    emitWindow(rotated);

    expect(dimensions()).toEqual(rotated);
    expect(widths).toEqual([INITIAL_WINDOW.width, rotated.width]);

    dispose();
  });

  // why: native re-emits a fresh metrics OBJECT on every change, including ones that move only the
  // screen. Without the field-wise `equals`, identity alone would wake every consumer on each
  // event — the same guard React/Vue/Angular/Svelte write by hand.
  it('does not notify when the window metrics are unchanged', () => {
    const window: IDisplayMetrics = {
      width: 412,
      height: 915,
      scale: 2.625,
      fontScale: 1,
    };
    let runs = 0;
    const { dispose } = inRoot(() => {
      const dimensions = createWindowDimensions();
      emitWindow(window);
      createEffect(() => {
        dimensions();
        runs += 1;
      });
    });
    expect(runs).toBe(1);

    // Same window values, a different object, and a screen that DID change.
    emitWindow({ ...window }, { ...window, height: 1000 });
    expect(runs).toBe(1);

    emitWindow({ ...window, fontScale: 1.3 });
    expect(runs).toBe(2);

    dispose();
  });

  it('unsubscribes on dispose', () => {
    const { value: dimensions, dispose } = inRoot(createWindowDimensions);

    const resized: IDisplayMetrics = {
      width: 320,
      height: 568,
      scale: 2,
      fontScale: 1,
    };
    emitWindow(resized);
    expect(dimensions()).toEqual(resized);

    dispose();

    emitWindow({ width: 1024, height: 768, scale: 2, fontScale: 1 });
    expect(dimensions()).toEqual(resized);
  });
});
