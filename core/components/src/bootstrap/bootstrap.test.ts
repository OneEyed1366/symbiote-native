// Unit test for the zero-config host bootstrap, which stays outside the main barrel of the package
// react-native is mocked, so the test sees exactly which of its members the bootstrap touches
// Only one guarded branch can fail: the default view config source swallowing an unknown name

import { afterEach, describe, expect, it, vi } from 'vitest';

const setColorProcessor = vi.fn();
const setNativeViewConfigSource = vi.fn();
const setImageSourceResolver = vi.fn();
const setAssetSourceResolver = vi.fn();
const setReactNativeHost = vi.fn();
const setPressabilityLoader = vi.fn();
const { backHandlerLoaded } = vi.hoisted(() => ({
  backHandlerLoaded: vi.fn(),
}));

// No `Image` member: the bootstrap must not reach for the component, it loads React's renderer
vi.mock('react-native', () => ({
  UIManager: { measure: vi.fn() },
  processColor: vi.fn(),
  get BackHandler() {
    backHandlerLoaded();
    return {};
  },
}));
vi.mock('react-native/Libraries/Image/resolveAssetSource', () => ({
  default: vi.fn(),
}));
vi.mock(
  'react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry',
  () => ({
    get: vi.fn(),
  }),
);
vi.mock('@symbiote-native/engine', () => ({
  setColorProcessor,
  setImageSourceResolver,
  setAssetSourceResolver,
  setNativeViewConfigSource,
  setReactNativeHost,
  setPressabilityLoader,
}));

const { bootstrapHost } = await import('./index');
const { processColor } = await import('react-native');
const { default: resolveAssetSource } =
  await import('react-native/Libraries/Image/resolveAssetSource');
const hostWiredAtImport = setReactNativeHost.mock.calls.length;
const ReactNativeViewConfigRegistry =
  await import('react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  delete globalThis.__SYMBIOTE_DEBUG__;
});

describe('importing the bootstrap module', () => {
  // `Dimensions.get('window')` at the top of an app file runs before `registerApp` is called
  it('hands react-native to the engine before any app module can read it', () => {
    expect(hostWiredAtImport).toBe(1);
  });
});

describe('bootstrapHost — explicit overrides (Positive)', () => {
  // A caller supplying its own seams must never be routed through react-native
  it('forwards explicit overrides to every seam instead of touching react-native', () => {
    const colorProcessor = (): unknown => 'color';
    const imageSourceResolver = (): unknown => 'image';
    const nativeViewConfigSource = (): undefined => undefined;

    bootstrapHost({
      colorProcessor,
      imageSourceResolver,
      nativeViewConfigSource,
      debug: true,
    });

    expect(setColorProcessor).toHaveBeenCalledWith(colorProcessor);
    expect(setImageSourceResolver).toHaveBeenCalledWith(imageSourceResolver);
    expect(setNativeViewConfigSource).toHaveBeenCalledWith(
      nativeViewConfigSource,
    );
    expect(processColor).not.toHaveBeenCalled();
    expect(resolveAssetSource).not.toHaveBeenCalled();
  });

  // `??` and not `||`, so an explicit `debug: false` beats a truthy DEBUG env var
  it('an explicit debug:false is never promoted to the env value', () => {
    vi.stubEnv('DEBUG', '1');
    bootstrapHost({
      colorProcessor: () => undefined,
      imageSourceResolver: () => undefined,
      nativeViewConfigSource: () => undefined,
      debug: false,
    });
    expect(globalThis.__SYMBIOTE_DEBUG__).toBe(false);
  });
});

describe('bootstrapHost — Android back button (Positive)', () => {
  // Android exits on back only when JS answers `hardwareBackPress`
  // RN subscribes when `BackHandler.android.js` loads, so the host loads it at startup
  it("loads RN's BackHandler at startup", () => {
    bootstrapHost();

    expect(backHandlerLoaded).toHaveBeenCalledTimes(1);
  });
});

describe('bootstrapHost — env-driven debug default (Positive)', () => {
  // `DEBUG` is the documented opt-in toggle, so omitting `debug` must read it
  it('turns debug on when DEBUG=1 and no override is given', () => {
    vi.stubEnv('DEBUG', '1');
    bootstrapHost({
      colorProcessor: () => undefined,
      imageSourceResolver: () => undefined,
      nativeViewConfigSource: () => undefined,
    });
    expect(globalThis.__SYMBIOTE_DEBUG__).toBe(true);
  });

  // Any value other than exactly '1' (unset, empty, '0', 'true') leaves it off
  it('leaves debug off when DEBUG is unset', () => {
    vi.stubEnv('DEBUG', '');
    bootstrapHost({
      colorProcessor: () => undefined,
      imageSourceResolver: () => undefined,
      nativeViewConfigSource: () => undefined,
    });
    expect(globalThis.__SYMBIOTE_DEBUG__).toBe(false);
  });
});

describe("bootstrapHost — zero-config seams (Positive, the module's actual purpose)", () => {
  // The default seams must reach RN's own functions, not just register some function
  it('wires the default color processor straight to RN processColor', () => {
    bootstrapHost();
    const registered = setColorProcessor.mock.calls[0][0] as (
      value: unknown,
    ) => unknown;
    registered('red');
    expect(processColor).toHaveBeenCalledWith('red');
  });

  it("wires the default image source resolver straight to RN's resolveAssetSource", () => {
    bootstrapHost();
    const registered = setImageSourceResolver.mock.calls[0][0] as (
      value: unknown,
    ) => unknown;
    registered({ uri: 'x.png' });
    expect(resolveAssetSource).toHaveBeenCalledWith({ uri: 'x.png' });
  });

  // The engine's `UIManager`, `LogBox` and the rest forward to RN's own module, handed over here
  it('hands react-native to the engine', () => {
    bootstrapHost();
    expect(setReactNativeHost).toHaveBeenCalledWith(
      expect.objectContaining({ UIManager: expect.anything() }),
    );
  });

  it('hands over a loader for RN Pressability instead of the class itself', () => {
    bootstrapHost();

    expect(setPressabilityLoader).toHaveBeenCalledWith(expect.any(Function));
  });

  it('hands over an explicit pressabilityLoader', () => {
    const pressabilityLoader = vi.fn();
    bootstrapHost({ pressabilityLoader });

    expect(setPressabilityLoader).toHaveBeenCalledWith(pressabilityLoader);
    expect(pressabilityLoader).not.toHaveBeenCalled();
  });

  it('hands over an explicit reactNative instead of the module', () => {
    const reactNative = { UIManager: { measure: vi.fn() } };
    bootstrapHost({ reactNative });
    expect(setReactNativeHost).toHaveBeenCalledWith(reactNative);
  });
});

describe('bootstrapHost — default native-view-config source (Positive / guarded failure)', () => {
  // A registered third-party Fabric view's config must reach the adapter unchanged
  it('returns whatever the RN registry has for a registered name', () => {
    const config = {
      validAttributes: {},
      bubblingEventTypes: {},
      directEventTypes: {},
    };
    vi.mocked(ReactNativeViewConfigRegistry.get).mockReturnValueOnce(config);
    bootstrapHost();
    const registered = setNativeViewConfigSource.mock.calls[0][0] as (
      name: string,
    ) => unknown;
    expect(registered('RCTSomeThirdPartyView')).toBe(config);
  });

  // RN's registry throws for an unknown name, bootstrap must answer undefined instead
  it('swallows the registry throw for an unregistered name and answers undefined', () => {
    vi.mocked(ReactNativeViewConfigRegistry.get).mockImplementationOnce(() => {
      throw new Error('view config not found');
    });
    bootstrapHost();
    const registered = setNativeViewConfigSource.mock.calls[0][0] as (
      name: string,
    ) => unknown;
    expect(registered('view')).toBeUndefined();
  });
});
