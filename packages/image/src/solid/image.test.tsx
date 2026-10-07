// Solid `Image`, `ImageBackground` and `useImage` over the recording fabric

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/solid';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import type { IImageViewHandle } from '../core';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const reloadAsync = vi.hoisted(() => vi.fn(async () => undefined));
const loadImageAsync = vi.hoisted(() => vi.fn());

vi.mock('../core/image-api', () => ({ loadImageAsync }));
vi.mock('expo-modules-core', () => ({
  Platform: platform,
  SharedRef: class {},
  requireNativeViewManager,
  requireNativeModule: () => ({
    ViewPrototypes: { ExpoImage: { reloadAsync } },
  }),
}));

const { Image } = await import('./image');
const { ImageBackground } = await import('./image-background');
const { useImage } = await import('./use-image');

const ROOT_TAG = 2311;
const VIEW_NAME = 'ViewManagerAdapter_ExpoImage';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === VIEW_NAME
    ? {
        directEventTypes: { topLoad: { registrationName: 'onLoad' } },
        validAttributes: { source: true, contentFit: true },
      }
    : undefined,
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  Reflect.set(globalThis, '__DEV__', true);
});

afterEach(() => unmount(ROOT_TAG));

function viewNode(): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === VIEW_NAME);
}

describe('Image', () => {
  it('paints the native view with resolved props', async () => {
    mount(ROOT_TAG, () => (
      <Image source="https://x/a.png" contentFit="contain" />
    ));
    await tick();

    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      source: [{ uri: 'https://x/a.png' }],
      contentFit: 'contain',
    });
  });

  it('follows a reactive prop without recreating the native node', async () => {
    const [fit, setFit] = createSignal<'cover' | 'fill'>('cover');
    mount(ROOT_TAG, () => <Image source="a" contentFit={fit()} />);
    await tick();
    const before = viewNode()?.handle;

    setFit('fill');
    await tick();

    const node = viewNode();
    expect(node?.handle).toBe(before);
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      contentFit: 'fill',
    });
  });

  it('hands `onLoad` the payload and then calls `onLoadEnd`', async () => {
    const calls: string[] = [];
    mount(ROOT_TAG, () => (
      <Image
        source="a"
        onLoad={event => calls.push(`load:${event.cacheType}`)}
        onLoadEnd={() => calls.push('end')}
      />
    ));
    await tick();

    const target = viewNode()?.instanceHandle;
    if (typeof target !== 'object' || target === null)
      throw new Error('no host');
    fabric.fireEvent(target, 'topLoad', { cacheType: 'disk', source: {} });

    expect(calls).toEqual(['load:disk', 'end']);
  });

  it('gives the handle through `ref` that calls the view function', async () => {
    let handle: IImageViewHandle | undefined;
    mount(ROOT_TAG, () => (
      <Image source="a" ref={instance => (handle = instance)} />
    ));
    await tick();

    await handle?.reloadAsync();

    expect(reloadAsync).toHaveBeenCalledTimes(1);
  });
});

describe('ImageBackground', () => {
  it('paints the image and the children inside one view', async () => {
    mount(ROOT_TAG, () => (
      <ImageBackground source="a" style={{ width: 10 }}>
        <view testID="over" />
      </ImageBackground>
    ));
    await tick();

    const image = viewNode();
    expect(image ? live.nodeOf(image.handle).payload : {}).toMatchObject({
      source: [{ uri: 'a' }],
    });
    expect(fabric.find(node => node.props.testID === 'over')).toBeDefined();
  });
});

describe('useImage', () => {
  it('loads and releases the old image when the source changes', async () => {
    const first = { release: vi.fn() };
    const second = { release: vi.fn() };
    loadImageAsync.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const [source, setSource] = createSignal('https://x/a.png');
    let image: ReturnType<typeof useImage> | undefined;
    mount(ROOT_TAG, () => {
      image = useImage(source, () => ({ maxWidth: 10 }));
      return <view />;
    });
    await vi.waitFor(() => expect(image?.()).toBe(first));

    setSource('https://x/b.png');
    await vi.waitFor(() => expect(image?.()).toBe(second));

    expect(first.release).toHaveBeenCalledTimes(1);
    expect(loadImageAsync).toHaveBeenCalledWith('https://x/a.png', {
      maxWidth: 10,
    });
  });

  it('releases the image when the owner is disposed', async () => {
    const loaded = { release: vi.fn() };
    loadImageAsync.mockResolvedValue(loaded);
    let image: ReturnType<typeof useImage> | undefined;
    mount(ROOT_TAG, () => {
      image = useImage(() => 'a');
      return <view />;
    });
    await vi.waitFor(() => expect(image?.()).toBe(loaded));

    unmount(ROOT_TAG);

    expect(loaded.release).toHaveBeenCalledTimes(1);
  });
});
