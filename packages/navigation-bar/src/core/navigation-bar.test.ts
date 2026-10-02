import { afterEach, describe, expect, it, vi } from 'vitest';

let colorScheme: 'light' | 'dark' | null = 'light';

vi.mock('@symbiote-native/engine', () => ({
  Appearance: {
    getColorScheme: () => colorScheme,
  },
}));

const FAKE_NATIVE_NAVIGATION_BAR = {
  setStyle: vi.fn(async () => undefined),
  setHidden: vi.fn(async () => undefined),
  getVisibilityAsync: vi.fn(async () => 'visible' as const),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
};

// `requireNativeModule` only resolves on-device, faked in place of expo-modules-core's runtime
// resolution, same pattern as packages/print/src/core/print.test.ts
vi.mock('./native-module', () => ({
  expoNavigationBar: FAKE_NATIVE_NAVIGATION_BAR,
}));

vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

let setStyle: typeof import('./navigation-bar').setStyle;
let setHidden: typeof import('./navigation-bar').setHidden;
let addVisibilityListener: typeof import('./navigation-bar').addVisibilityListener;
let setVisibilityAsync: typeof import('./navigation-bar').setVisibilityAsync;
let getVisibilityAsync: typeof import('./navigation-bar').getVisibilityAsync;

// The style/hidden dedup cache lives at module scope, so each test needing a clean slate
// gets a fresh module instance rather than fighting the previous test's cached value
async function importFresh(): Promise<void> {
  vi.resetModules();
  ({
    setStyle,
    setHidden,
    addVisibilityListener,
    setVisibilityAsync,
    getVisibilityAsync,
  } = await import('./navigation-bar'));
}

afterEach(() => {
  colorScheme = 'light';
  vi.clearAllMocks();
});

describe('setStyle', () => {
  it('resolves "auto" against the current color scheme and forwards it to the native module', async () => {
    await importFresh();
    colorScheme = 'light';

    setStyle('auto');

    expect(FAKE_NATIVE_NAVIGATION_BAR.setStyle).toHaveBeenCalledWith('dark');
  });

  it('resolves "inverted" against the current color scheme', async () => {
    await importFresh();
    colorScheme = 'dark';

    setStyle('inverted');

    expect(FAKE_NATIVE_NAVIGATION_BAR.setStyle).toHaveBeenCalledWith('dark');
  });

  it('skips a redundant native call when the resolved style is unchanged', async () => {
    await importFresh();

    setStyle('dark');
    setStyle('dark');

    expect(FAKE_NATIVE_NAVIGATION_BAR.setStyle).toHaveBeenCalledTimes(1);
  });

  it('throws UnavailabilityError when the native module has no setStyle', async () => {
    await importFresh();
    FAKE_NATIVE_NAVIGATION_BAR.setStyle = undefined as never;

    expect(() => setStyle('dark')).toThrow(/setStyle/);

    FAKE_NATIVE_NAVIGATION_BAR.setStyle = vi.fn(async () => undefined);
  });
});

describe('setHidden', () => {
  it('forwards a changed value to the native module', async () => {
    await importFresh();

    setHidden(true);

    expect(FAKE_NATIVE_NAVIGATION_BAR.setHidden).toHaveBeenCalledWith(true);
  });

  it('skips a redundant native call when the value is unchanged', async () => {
    await importFresh();

    setHidden(true);
    setHidden(true);

    expect(FAKE_NATIVE_NAVIGATION_BAR.setHidden).toHaveBeenCalledTimes(1);
  });

  it('throws UnavailabilityError when the native module has no setHidden', async () => {
    await importFresh();
    FAKE_NATIVE_NAVIGATION_BAR.setHidden = undefined as never;

    expect(() => setHidden(true)).toThrow(/setHidden/);

    FAKE_NATIVE_NAVIGATION_BAR.setHidden = vi.fn(async () => undefined);
  });
});

describe('addVisibilityListener', () => {
  it('adds and removes a visibility listener', async () => {
    await importFresh();

    const subscription = addVisibilityListener(() => {});

    expect(() => subscription.remove()).not.toThrow();
  });

  it('throws UnavailabilityError when the native module has no addListener', async () => {
    await importFresh();
    FAKE_NATIVE_NAVIGATION_BAR.addListener = undefined as never;

    expect(() => addVisibilityListener(() => {})).toThrow(
      /addVisibilityListener/,
    );

    FAKE_NATIVE_NAVIGATION_BAR.addListener = vi.fn(() => ({ remove: vi.fn() }));
  });
});

describe('setVisibilityAsync', () => {
  it('calls setHidden on the native module directly', async () => {
    await importFresh();

    await setVisibilityAsync('hidden');

    expect(FAKE_NATIVE_NAVIGATION_BAR.setHidden).toHaveBeenLastCalledWith(true);
  });
});

describe('getVisibilityAsync', () => {
  it('resolves the visibility from the native module', async () => {
    await importFresh();

    await expect(getVisibilityAsync()).resolves.toBe('visible');
    expect(FAKE_NATIVE_NAVIGATION_BAR.getVisibilityAsync).toHaveBeenCalled();
  });
});
