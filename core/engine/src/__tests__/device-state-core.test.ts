// Co-located unit test: the device-state modules (Dimensions / AppState / Appearance,
// in @symbiote-native/engine) plus the pure KeyboardAvoidingView math (in @symbiote-native/components). A fake
// __turboModuleProxy returns the native modules; a fake RN$registerCallableModule captures the
// device hub so the test plays "native" and emits didUpdateDimensions / appStateDidChange /
// appearanceChanged.

import { beforeAll, describe, expect, it } from 'vitest';
import { Dimensions } from '../dimensions';
import { AppState } from '../app-state';
import { Appearance } from '../appearance';
import {
  computeInset,
  readKeyboardFrame,
  readLayoutFrame,
  resolveKeyboardAvoidingLayout,
} from '../../../components/src/view/render-keyboard-avoiding-view';

type IDeviceHub = { emit: (eventType: string, ...args: unknown[]) => void };

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

const INITIAL_WINDOW = { width: 400, height: 800, scale: 3, fontScale: 2 };

const fakeDeviceInfo = {
  getConstants: () => ({ Dimensions: { window: INITIAL_WINDOW } }),
};
const fakeAppState = {
  getConstants: () => ({ initialAppState: 'active' }),
  addListener: (): void => {},
  removeListeners: (): void => {},
};
let currentScheme: 'light' | 'dark' | null = 'light';
const fakeAppearance = {
  getColorScheme: (): 'light' | 'dark' | null => currentScheme,
  setColorScheme: (scheme: 'light' | 'dark' | 'unspecified'): void => {
    currentScheme = scheme === 'unspecified' ? null : scheme;
  },
  addListener: (): void => {},
  removeListeners: (): void => {},
};

const registeredModules: Record<string, unknown> = {
  DeviceInfo: fakeDeviceInfo,
  AppState: fakeAppState,
  Appearance: fakeAppearance,
};

let deviceHub: IDeviceHub | undefined;

beforeAll(() => {
  Object.assign(globalThis, {
    __turboModuleProxy: <T>(name: string): T | null => {
      const module = registeredModules[name];
      return isType<T>(module) ? module : null;
    },
    RN$registerCallableModule: (name: string, factory: () => IDeviceHub): void => {
      if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
    },
  });
});

function requireHub(): IDeviceHub {
  if (deviceHub === undefined) throw new Error('the device hub was never installed');
  return deviceHub;
}

// The Dimensions/AppState/Appearance modules each carry their own dedicated branch-level
// suite (dimensions.test.ts / app-state.test.ts / appearance.test.ts, co-located). This file's
// job is narrower: prove the SHARED fake-native harness (__turboModuleProxy +
// RN$registerCallableModule) actually wires all three through the same device hub end to end —
// integration, not exhaustive branch coverage of each module.
describe('Dimensions (integration: resolves via the shared native harness)', () => {
  // why: iOS has no separate "screen" native metric distinct from "window" for a
  // non-split-view app, so `get('screen')` must mirror `get('window')` rather than
  // read a second, unpopulated source.
  it('resolves from DeviceInfo and mirrors window to screen on iOS', () => {
    expect(Dimensions.get('window').width).toBe(400);
    expect(Dimensions.get('screen').width).toBe(400);
    // The first resolve installs the device hub.
    expect(deviceHub).toBeDefined();
  });

  // why: a rotation/split-view resize must reach subscribers AND update the cached
  // getter, so a component that only reads `Dimensions.get` later (never resolving
  // the current sync call) still sees the fresh size.
  it("fires 'change' and updates the cache on a native didUpdateDimensions", () => {
    let changed: { window: { width: number } } | undefined;
    const sub = Dimensions.addEventListener('change', set => {
      changed = set;
    });
    requireHub().emit('didUpdateDimensions', {
      window: { width: 500, height: 900, scale: 3, fontScale: 2 },
    });
    expect(changed?.window.width).toBe(500);
    expect(Dimensions.get('window').width).toBe(500);
    sub.remove();
  });
});

describe('AppState (integration: resolves via the shared native harness)', () => {
  // why: a component reading AppState before any transition must see the state the
  // OS process actually launched in, not an undefined/loading placeholder.
  it("seeds 'active' and reports availability", () => {
    expect(AppState.currentState).toBe('active');
    expect(AppState.isAvailable).toBe(true);
  });

  // why: backgrounding must be observable both as a push (listener) and a pull
  // (currentState), since some consumers subscribe and others poll on next render.
  it("fires 'change' and tracks the current state on appStateDidChange", () => {
    let value: unknown;
    const sub = AppState.addEventListener('change', next => {
      value = next;
    });
    requireHub().emit('appStateDidChange', { app_state: 'background' });
    expect(value).toBe('background');
    expect(AppState.currentState).toBe('background');
    sub.remove();
  });
});

describe('Appearance (integration: resolves via the shared native harness)', () => {
  // why: a system-theme switch (e.g. iOS Dark Mode toggle) must reach a themed app
  // both as a push event and as the next synchronous read.
  it('reads and reports color-scheme changes on appearanceChanged', () => {
    expect(Appearance.getColorScheme()).toBe('light');
    let changed: { colorScheme: 'light' | 'dark' | null } | undefined;
    const sub = Appearance.addChangeListener(prefs => {
      changed = prefs;
    });
    requireHub().emit('appearanceChanged', { colorScheme: 'dark' });
    expect(changed?.colorScheme).toBe('dark');
    expect(Appearance.getColorScheme()).toBe('dark');
    sub.remove();
  });
});

// KeyboardAvoidingView's pure math has no dedicated test file elsewhere in the repo — this
// describe block is its ONLY coverage, so every branch of readKeyboardFrame / readLayoutFrame /
// computeInset / resolveKeyboardAvoidingLayout is enumerated here, not just the happy path.
describe('readKeyboardFrame / readLayoutFrame (returns undefined on a malformed payload, never throws)', () => {
  const frame = readLayoutFrame({ y: 0, height: 800 });
  const keyboard = readKeyboardFrame({ endCoordinates: { screenY: 500, height: 300 } });

  // why: a well-formed onLayout/keyboard-event payload is the whole point of these
  // readers — the rest of the KAV math depends on them extracting the right fields.
  it('extracts the layout and keyboard frames from a well-formed payload', () => {
    expect(frame).toEqual({ y: 0, height: 800 });
    expect(keyboard).toEqual({ screenY: 500, height: 300 });
  });

  // why: both readers cross a native-event trust boundary (raw `unknown` payload);
  // a shape the reader doesn't recognize must degrade to "no frame yet" rather than
  // crash the render, since a stray/older-OS event shape must not blank the screen.
  it('returns undefined for a non-record, a record missing the nested field, and numeric-typo fields', () => {
    expect(readLayoutFrame(null)).toBeUndefined();
    expect(readLayoutFrame({ y: 0 })).toBeUndefined();
    expect(readLayoutFrame({ y: '0', height: 800 })).toBeUndefined();
    expect(readKeyboardFrame({})).toBeUndefined();
    expect(readKeyboardFrame({ endCoordinates: { screenY: 500 } })).toBeUndefined();
  });
});

describe('computeInset', () => {
  const frame = readLayoutFrame({ y: 0, height: 800 });
  const keyboard = readKeyboardFrame({ endCoordinates: { screenY: 500, height: 300 } });

  // why: before either frame has been measured (no onLayout yet, or the keyboard
  // hasn't opened) there is nothing to avoid, so the inset must be a safe 0 rather
  // than reading through an undefined frame.
  it('is 0 when either frame is not yet known', () => {
    expect(computeInset(undefined, keyboard, 0)).toBe(0);
    expect(computeInset(frame, undefined, 0)).toBe(0);
  });

  // why: the inset is how far the view's bottom edge overlaps the keyboard's top
  // edge, and `verticalOffset` (a caller-supplied header/nav-bar height) shifts
  // that edge — this is RN's _relativeKeyboardHeight formula, the load-bearing
  // math the whole component exists to get right.
  it('computes the overlap inset, honoring verticalOffset and clamping at 0', () => {
    // view bottom = 0 + 800 = 800; keyboard top = 500; offset 0 -> inset = 300.
    expect(computeInset(frame, keyboard, 0)).toBe(300);
    // a vertical offset of 50 raises the keyboard line -> inset 350.
    expect(computeInset(frame, keyboard, 50)).toBe(350);
    // no overlap (keyboard below the view) clamps at 0.
    expect(computeInset({ y: 0, height: 100 }, keyboard, 0)).toBe(0);
  });
});

describe('resolveKeyboardAvoidingLayout', () => {
  // why: 'padding' is the default RN behavior on iOS — it must add exactly the
  // inset as bottom padding on the SAME wrapper the children render in, no extra
  // nesting (nesting would break flex layouts that assume a single wrapper).
  it("folds paddingBottom into the wrapper for behavior 'padding'", () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'padding',
      effectiveInset: 300,
      style: { flex: 1 },
    });
    expect(layout.kind).toBe('wrapper');
    expect(layout.kind === 'wrapper' && Array.isArray(layout.wrapperStyle)).toBe(true);
    if (layout.kind === 'wrapper' && Array.isArray(layout.wrapperStyle)) {
      expect(layout.wrapperStyle[1]).toEqual({ paddingBottom: 300 });
    }
  });

  // why: 'position' must NOT resize the wrapper (it stays the caller's own style)
  // but push an INNER view up by the inset, and it must keep carrying the caller's
  // wrapper style — a caller-supplied flex/background on the outer view must
  // survive the 'position' branch same as every other behavior.
  it("nests with bottom: inset for behavior 'position', preserving the wrapper's own style", () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'position',
      effectiveInset: 120,
      style: { flex: 1 },
      contentContainerStyle: { padding: 8 },
    });
    expect(layout.kind).toBe('nested');
    expect(layout.kind === 'nested' && layout.wrapperStyle).toEqual({ flex: 1 });
    if (layout.kind === 'nested' && Array.isArray(layout.innerStyle)) {
      expect(layout.innerStyle[1]).toEqual({ bottom: 120 });
    }
  });

  // why: 'height' shrinks the wrapper from its FIRST measured height, so the view
  // still fits above the keyboard without ever exceeding its original footprint.
  it("shrinks from the initial height for behavior 'height'", () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'height',
      effectiveInset: 200,
      initialHeight: 800,
    });
    expect(layout.kind).toBe('wrapper');
    if (layout.kind === 'wrapper' && Array.isArray(layout.wrapperStyle)) {
      expect(layout.wrapperStyle[1]).toEqual({ height: 600, flex: 0 });
    }
  });

  // why: once the keyboard dismisses, `enabled`'s caller resets effectiveInset to
  // 0 — the wrapper must return to the caller's own style untouched, not linger at
  // the shrunk height from the last time the keyboard was up.
  it('leaves height mode untouched when disabled (effectiveInset 0)', () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'height',
      effectiveInset: 0,
      initialHeight: 800,
      style: { flex: 1 },
    });
    expect(layout.kind).toBe('wrapper');
    if (layout.kind === 'wrapper') {
      expect(layout.wrapperStyle).toEqual({ flex: 1 });
    }
  });

  // why: 'height' mode needs a measured baseline to shrink FROM; a keyboard event
  // that races ahead of the wrapper's first onLayout (initialHeight still unknown)
  // must fall back to the untouched style rather than compute `undefined - inset`
  // and hand the adapter a NaN height.
  it('leaves height mode untouched when the wrapper has not been measured yet (no initialHeight)', () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'height',
      effectiveInset: 200,
      style: { flex: 1 },
    });
    expect(layout.kind).toBe('wrapper');
    if (layout.kind === 'wrapper') {
      expect(layout.wrapperStyle).toEqual({ flex: 1 });
    }
  });

  // why: Android has no default `behavior` prop (RN leaves it undefined there) —
  // the component must degrade to a plain passthrough wrapper instead of picking
  // an arbitrary behavior on the caller's behalf.
  it('passes the style through untouched when no behavior is given', () => {
    const layout = resolveKeyboardAvoidingLayout({ effectiveInset: 200, style: { flex: 1 } });
    expect(layout).toEqual({ kind: 'wrapper', wrapperStyle: { flex: 1 } });
  });
});
