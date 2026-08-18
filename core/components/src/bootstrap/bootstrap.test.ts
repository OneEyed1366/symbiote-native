// Unit test for the zero-config host bootstrap (see bootstrap.ts's header for why this file
// stays outside @symbiote-native/components' main barrel). react-native itself is mocked: its
// real source is Flow syntax Vitest's Rolldown-based transform cannot parse.
//
// No Negative group beyond one guarded branch: bootstrapHost itself never throws (it only wires
// four seams + a debug flag). The one real failure path in this module —
// defaultNativeViewConfigSource swallowing RN's registry.get() throw for an unregistered name —
// is covered under its own describe below.
import { afterEach, describe, expect, it, vi } from 'vitest';

const setColorProcessor = vi.fn();
const setDeviceEventSource = vi.fn();
const setNativeViewConfigSource = vi.fn();
const setImageSourceResolver = vi.fn();

vi.mock('react-native', () => ({
  processColor: vi.fn(),
  DeviceEventEmitter: { addListener: vi.fn() },
  Image: { resolveAssetSource: vi.fn() },
}));
vi.mock(
  'react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry',
  () => ({
    get: vi.fn(),
  }),
);
vi.mock('@symbiote-native/engine', () => ({
  setColorProcessor,
  setDeviceEventSource,
  setImageSourceResolver,
  setNativeViewConfigSource,
}));

const { bootstrapHost } = await import('./index');
const { processColor, DeviceEventEmitter, Image } =
  await import('react-native');
const ReactNativeViewConfigRegistry =
  await import('react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  delete globalThis.__SYMBIOTE_DEBUG__;
});

describe('bootstrapHost — explicit overrides (Positive)', () => {
  // why: a caller supplying its own seams (a non-RN host, or a test harness) must never be routed
  // through react-native regardless — the whole point of the four seams being overridable.
  it('forwards explicit overrides to every seam instead of touching react-native', () => {
    const colorProcessor = (): unknown => 'color';
    const imageSourceResolver = (): unknown => 'image';
    const deviceEventSource = { addListener: vi.fn() };
    const nativeViewConfigSource = (): undefined => undefined;

    bootstrapHost({
      colorProcessor,
      imageSourceResolver,
      deviceEventSource,
      nativeViewConfigSource,
      debug: true,
    });

    expect(setColorProcessor).toHaveBeenCalledWith(colorProcessor);
    expect(setImageSourceResolver).toHaveBeenCalledWith(imageSourceResolver);
    expect(setDeviceEventSource).toHaveBeenCalledWith(deviceEventSource);
    expect(setNativeViewConfigSource).toHaveBeenCalledWith(
      nativeViewConfigSource,
    );
    expect(processColor).not.toHaveBeenCalled();
    expect(Image.resolveAssetSource).not.toHaveBeenCalled();
  });

  // why: `??` (not `||`) is the load-bearing operator on every seam — an explicit `debug: false`
  // must win over a truthy DEBUG env var, or a caller could never force debug OFF in an
  // environment that happens to have DEBUG=1 set globally.
  it('an explicit debug:false is never promoted to the env value', () => {
    vi.stubEnv('DEBUG', '1');
    bootstrapHost({
      colorProcessor: () => undefined,
      imageSourceResolver: () => undefined,
      deviceEventSource: { addListener: vi.fn() },
      nativeViewConfigSource: () => undefined,
      debug: false,
    });
    expect(globalThis.__SYMBIOTE_DEBUG__).toBe(false);
  });
});

describe('bootstrapHost — env-driven debug default (Positive)', () => {
  // why: DEBUG is the documented opt-in toggle (see @symbiote-native/engine's dlog) — omitting
  // `debug` entirely must read it, not silently default to off.
  it('turns debug on when DEBUG=1 and no override is given', () => {
    vi.stubEnv('DEBUG', '1');
    bootstrapHost({
      colorProcessor: () => undefined,
      imageSourceResolver: () => undefined,
      deviceEventSource: { addListener: vi.fn() },
      nativeViewConfigSource: () => undefined,
    });
    expect(globalThis.__SYMBIOTE_DEBUG__).toBe(true);
  });

  // why: the flag is OFF by default (per this repo's keep_logs_gate_behind_DEBUG rule) — any
  // DEBUG value other than exactly '1' (unset, empty, '0', 'true') must not enable it.
  it('leaves debug off when DEBUG is unset', () => {
    vi.stubEnv('DEBUG', '');
    bootstrapHost({
      colorProcessor: () => undefined,
      imageSourceResolver: () => undefined,
      deviceEventSource: { addListener: vi.fn() },
      nativeViewConfigSource: () => undefined,
    });
    expect(globalThis.__SYMBIOTE_DEBUG__).toBe(false);
  });
});

describe("bootstrapHost — zero-config seams (Positive, the module's actual purpose)", () => {
  // why: this is the whole point of bootstrapHost per its own header ("wired from real
  // react-native in one call") — proving the DEFAULT seams (no overrides given) really delegate
  // to RN's processColor / Image.resolveAssetSource / DeviceEventEmitter, not just that some
  // function got registered.
  it('wires the default color processor straight to RN processColor', () => {
    bootstrapHost();
    const registered = setColorProcessor.mock.calls[0][0] as (
      value: unknown,
    ) => unknown;
    registered('red');
    expect(processColor).toHaveBeenCalledWith('red');
  });

  it('wires the default image source resolver straight to RN Image.resolveAssetSource', () => {
    bootstrapHost();
    const registered = setImageSourceResolver.mock.calls[0][0] as (
      value: unknown,
    ) => unknown;
    registered({ uri: 'x.png' });
    expect(Image.resolveAssetSource).toHaveBeenCalledWith({ uri: 'x.png' });
  });

  it('wires the default device event source straight to RN DeviceEventEmitter', () => {
    bootstrapHost();
    expect(setDeviceEventSource).toHaveBeenCalledWith(DeviceEventEmitter);
  });
});

describe('bootstrapHost — default native-view-config source (Positive / guarded failure)', () => {
  // why: a registered third-party Fabric view's config must reach the adapter unchanged — this is
  // the seam <third_party_rn_packages_are_react_only>-adjacent code relies on to derive events for
  // any RN view manager by name.
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

  // why: RN's registry throws (not returns undefined) for an unknown view name — the default
  // source must swallow that and answer undefined, or every non-Fabric-registered name (which
  // includes every one of this package's own built-ins) would crash bootstrap instead of falling
  // through gracefully.
  it('swallows the registry throw for an unregistered name and answers undefined', () => {
    vi.mocked(ReactNativeViewConfigRegistry.get).mockImplementationOnce(() => {
      throw new Error('view config not found');
    });
    bootstrapHost();
    const registered = setNativeViewConfigSource.mock.calls[0][0] as (
      name: string,
    ) => unknown;
    expect(registered('symbiote-view')).toBeUndefined();
  });
});
