// The web variant differs from the native one in three defaults, and those are what is asserted
// react-native is mocked, as it is a Flow file the test transform cannot parse

import { afterEach, describe, expect, it, vi } from 'vitest';

const setColorProcessor = vi.fn();
const setNativeViewConfigSource = vi.fn();
const setImageSourceResolver = vi.fn();
const setAssetSourceResolver = vi.fn();
const setReactNativeHost = vi.fn();
const setPressabilityLoader = vi.fn();

vi.mock('@symbiote-native/web', () => ({ runAppOnWeb: vi.fn() }));
vi.mock('react-native', () => ({ Dimensions: {} }));
vi.mock('react-native/Libraries/Image/resolveAssetSource', () => ({
  default: vi.fn(),
}));
vi.mock('@symbiote-native/engine', () => ({
  setColorProcessor,
  setImageSourceResolver,
  setAssetSourceResolver,
  setNativeViewConfigSource,
  setReactNativeHost,
  setPressabilityLoader,
}));

const { bootstrapHost, startApp } = await import('./index.web');
const { runAppOnWeb } = await import('@symbiote-native/web');
const ReactNative = await import('react-native');
const hostWiredAtImport = setReactNativeHost.mock.calls.length;

afterEach(() => {
  vi.clearAllMocks();
  delete globalThis.__SYMBIOTE_DEBUG__;
});

describe('web bootstrap', () => {
  it('hands react-native-web to the engine at import, before an app file reads it', () => {
    expect(hostWiredAtImport).toBe(1);
  });

  it('keeps a CSS color as the string it is, where native converts it to an int', () => {
    bootstrapHost();

    const colorProcessor = setColorProcessor.mock.calls[0]?.[0];
    expect(colorProcessor('rebeccapurple')).toBe('rebeccapurple');
  });

  it('answers no view config for any name, as the registry is native only', () => {
    bootstrapHost();

    const source = setNativeViewConfigSource.mock.calls[0]?.[0];
    expect(source('SomeNativeView')).toBeUndefined();
  });

  it('wires react-native, the image resolvers and the pressability loader', () => {
    bootstrapHost();

    expect(setReactNativeHost).toHaveBeenCalledWith(ReactNative);
    expect(setImageSourceResolver).toHaveBeenCalledTimes(1);
    expect(setAssetSourceResolver).toHaveBeenCalledTimes(1);
    expect(setPressabilityLoader).toHaveBeenCalledTimes(1);
  });

  it('lets an app override a seam', () => {
    const colorProcessor = (): unknown => 'mine';

    bootstrapHost({ colorProcessor });

    expect(setColorProcessor).toHaveBeenCalledWith(colorProcessor);
  });
});

describe('web startApp', () => {
  // No native host drives the registry on a page, so the app is registered and run in one call
  it('wires the host, then registers the app and runs it on the page', () => {
    const AppRegistry = { registerComponent: vi.fn(), runApplication: vi.fn() };
    const setHostRegistrar = vi.fn();
    const provider = (): string => 'App';

    startApp({ AppRegistry, setHostRegistrar }, 'canary', provider);

    expect(setColorProcessor).toHaveBeenCalledTimes(1);
    expect(runAppOnWeb).toHaveBeenCalledWith(AppRegistry, 'canary', provider);
  });

  it('never hands a registrar to the adapter, as the page has no native registry', () => {
    const setHostRegistrar = vi.fn();

    startApp(
      {
        AppRegistry: { registerComponent: vi.fn(), runApplication: vi.fn() },
        setHostRegistrar,
      },
      'canary',
      () => 'App',
    );

    expect(setHostRegistrar).not.toHaveBeenCalled();
  });
});
