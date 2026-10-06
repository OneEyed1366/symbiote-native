import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  clearGlobalStyles,
  createElement,
  createSurface,
  registerRules,
} from '@symbiote-native/engine';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const viewFunctions = vi.hoisted(() => ({
  startAnimating: vi.fn(async () => undefined),
  stopAnimating: vi.fn(async () => undefined),
  lockResourceAsync: vi.fn(async () => undefined),
  unlockResourceAsync: vi.fn(async () => undefined),
  reloadAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  SharedRef: class {},
  requireNativeViewManager,
  requireNativeModule: () => ({ ViewPrototypes: { ExpoImage: viewFunctions } }),
}));

const { createImageView, imageViewName } = await import('./image-view');

installRecordingFabric();

let nextRootTag = 9_100;

function mountedNode() {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

function propsOf(props: object) {
  return createImageView(() => null).render(props)?.props ?? {};
}

beforeEach(() => {
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('createImageView render', () => {
  it('renders the view manager adapter of the module', () => {
    const descriptor = createImageView(() => null).render({ source: 'a' });

    expect(descriptor?.type).toBe(imageViewName());
    expect(imageViewName()).toBe('ViewManagerAdapter_ExpoImage');
  });

  it('resolves source, placeholder, fit, position and transition for native', () => {
    expect(
      propsOf({
        source: 'https://x/a.png',
        placeholder: 'blurhash:/abc',
        transition: 100,
      }),
    ).toMatchObject({
      source: [{ uri: 'https://x/a.png' }],
      placeholder: [{ uri: 'blurhash:/abc', width: 16, height: 16 }],
      contentFit: 'cover',
      contentPosition: { top: '50%', left: '50%' },
      transition: { duration: 100 },
    });
  });

  it('takes the placeholder from the deprecated `defaultSource`', () => {
    expect(propsOf({ defaultSource: { uri: 'p' } })).toMatchObject({
      placeholder: [{ uri: 'p' }],
    });
  });

  it('prefers a style `resizeMode` when the prop is absent', () => {
    expect(propsOf({ style: { resizeMode: 'stretch' } })).toMatchObject({
      contentFit: 'fill',
    });
  });

  it('labels the view with `alt` when there is no accessibility label', () => {
    expect(propsOf({ alt: 'cat' })).toMatchObject({
      accessibilityLabel: 'cat',
    });
    expect(propsOf({ alt: 'cat', accessibilityLabel: 'dog' })).toMatchObject({
      accessibilityLabel: 'dog',
    });
  });

  it('keeps `elevation` on Android and `shadow*` on iOS', () => {
    const style = { elevation: 4, shadowRadius: 2 };
    expect(propsOf({ style })).toMatchObject({ shadowRadius: 2 });
    expect(propsOf({ style })).not.toHaveProperty('elevation');

    platform.OS = 'android';
    expect(propsOf({ style })).toMatchObject({ elevation: 4 });
    expect(propsOf({ style })).not.toHaveProperty('shadowRadius');
  });

  it('moves the background color off the style on Android', () => {
    platform.OS = 'android';
    const props = propsOf({ style: { backgroundColor: '#ff0000' } });

    expect(props).toHaveProperty('backgroundColor');
    expect(props.style).not.toHaveProperty('backgroundColor');
  });

  it('reads `resizeMode` and the Android background from a CSS class like from `style`', () => {
    const style = { resizeMode: 'stretch', backgroundColor: '#ff0000' };
    registerRules([
      { tokens: ['stretched'], specificity: [0, 1, 0], order: 0, style },
    ]);
    platform.OS = 'android';
    const props = propsOf({ className: 'stretched' });
    clearGlobalStyles();

    expect(props).toMatchObject({ contentFit: 'fill' });
    expect(props).toHaveProperty('backgroundColor');
  });

  it('processes `tintColor` from the prop or the style', () => {
    expect(propsOf({ tintColor: '#ff0000' }).tintColor).toBe(
      propsOf({ style: { tintColor: '#ff0000' } }).tintColor,
    );
    expect(propsOf({ tintColor: '#ff0000' }).tintColor).toBeDefined();
    expect(propsOf({}).tintColor).toBeUndefined();
  });

  it('adds the symbol props for an SF Symbol source', () => {
    expect(
      propsOf({
        source: 'sf:star',
        style: { fontSize: 24, fontWeight: 600, color: '#00ff00' },
        sfEffect: 'bounce',
      }),
    ).toMatchObject({
      contentFit: 'contain',
      symbolWeight: '600',
      symbolSize: 24,
      sfEffect: [{ effect: 'bounce' }],
      style: { width: 24, height: 24 },
    });
  });

  it('leaves the symbol props empty for a bitmap source', () => {
    expect(propsOf({ source: 'a' })).toMatchObject({
      symbolWeight: null,
      symbolSize: null,
      sfEffect: null,
    });
  });

  it('renders nothing when the view cannot register', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });

    expect(createImageView(() => null).render({})).toBeNull();
  });
});

describe('createImageView events', () => {
  it('passes the native payload and then reports the end of loading', () => {
    const calls: string[] = [];
    const props = propsOf({
      onLoad: (event: unknown) => calls.push(`load:${JSON.stringify(event)}`),
      onLoadEnd: () => calls.push('end'),
    });

    const onLoad = props.onLoad;
    if (typeof onLoad !== 'function') throw new Error('onLoad is not wired');
    onLoad({ nativeEvent: { cacheType: 'none', source: {} } });

    expect(calls).toEqual(['load:{"cacheType":"none","source":{}}', 'end']);
  });

  it('ends loading after an error too', () => {
    const calls: string[] = [];
    const props = propsOf({
      onError: (event: unknown) => calls.push(`error:${JSON.stringify(event)}`),
      onLoadEnd: () => calls.push('end'),
    });

    const onError = props.onError;
    if (typeof onError !== 'function') throw new Error('onError is not wired');
    onError({ nativeEvent: { error: 'boom' } });

    expect(calls).toEqual(['error:{"error":"boom"}', 'end']);
  });

  it('forwards load start and progress', () => {
    const onLoadStart = vi.fn();
    const onProgress = vi.fn();
    const props = propsOf({ onLoadStart, onProgress });

    const start = props.onLoadStart;
    const progress = props.onProgress;
    if (typeof start !== 'function' || typeof progress !== 'function') {
      throw new Error('events are not wired');
    }
    start({ nativeEvent: {} });
    progress({ nativeEvent: { loaded: 1, total: 2 } });

    expect(onLoadStart).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({ loaded: 1, total: 2 });
  });
});

describe('createImageView handle', () => {
  it('calls the view functions of a mounted view', async () => {
    const handle = createImageView(() => mountedNode()).handle;

    await handle.startAnimating();
    await handle.stopAnimating();
    await handle.lockResourceAsync();
    await handle.unlockResourceAsync();
    await handle.reloadAsync();

    expect(viewFunctions.startAnimating).toHaveBeenCalledTimes(1);
    expect(viewFunctions.stopAnimating).toHaveBeenCalledTimes(1);
    expect(viewFunctions.lockResourceAsync).toHaveBeenCalledTimes(1);
    expect(viewFunctions.unlockResourceAsync).toHaveBeenCalledTimes(1);
    expect(viewFunctions.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('does nothing before the view has a host node', async () => {
    await createImageView(() => null).handle.reloadAsync();

    expect(viewFunctions.reloadAsync).not.toHaveBeenCalled();
  });
});
