// Angular `Image`, `ImageBackground` and `injectImage` over the recording fabric

import '@angular/compiler';
import { Component, signal, ViewChild } from '@angular/core';
import type { Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/angular';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import type { ImageRef } from '../core';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const reloadAsync = vi.hoisted(() => vi.fn(async () => undefined));
const loadImageAsync = vi.hoisted(() => vi.fn());
const handlers = vi.hoisted(() => ({ onLoad: vi.fn(), onLoadEnd: vi.fn() }));

vi.mock('../core/image-api', () => ({ loadImageAsync }));
vi.mock('expo-modules-core', () => ({
  Platform: platform,
  SharedRef: class {},
  requireNativeViewManager,
  requireNativeModule: () => ({
    ViewPrototypes: { ExpoImage: { reloadAsync } },
  }),
}));

const { ExpoImage } = await import('./image');
const { ExpoImageBackground } = await import('./image-background');
const { injectImage } = await import('./inject-image');

const ROOT_TAG = 2411;
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

let host: ImageHost | undefined;

@Component({
  selector: 'image-host',
  standalone: true,
  imports: [ExpoImage],
  template: `<ExpoImage
    source="https://x/a.png"
    contentFit="contain"
    [onLoad]="onLoad"
    [onLoadEnd]="onLoadEnd"
  />`,
})
class ImageHost {
  @ViewChild(ExpoImage) view?: InstanceType<typeof ExpoImage>;
  readonly onLoad = handlers.onLoad;
  readonly onLoadEnd = handlers.onLoadEnd;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }
}

@Component({
  selector: 'background-host',
  standalone: true,
  imports: [ExpoImageBackground],
  template: `<ExpoImageBackground source="a" [style]="{ width: 10 }">
    <view testID="over"></view>
  </ExpoImageBackground>`,
})
class BackgroundHost {}

const held: { image: Signal<ImageRef | null> | null } = { image: null };
const source = signal('https://x/a.png');

@Component({ selector: 'inject-image-host', standalone: true, template: '' })
class InjectHost {
  readonly image = injectImage(source, () => ({ maxWidth: 10 }));
  constructor() {
    held.image = this.image;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  host = undefined;
  held.image = null;
  source.set('https://x/a.png');
  Reflect.set(globalThis, '__DEV__', true);
});

afterEach(() => unmount(ROOT_TAG));

function viewNode(): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === VIEW_NAME);
}

describe('Image', () => {
  it('paints the native view with resolved inputs', async () => {
    mount(ROOT_TAG, ImageHost);
    await tick();

    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      source: [{ uri: 'https://x/a.png' }],
      contentFit: 'contain',
    });
  });

  it('hands `onLoad` the payload and then calls `onLoadEnd`', async () => {
    mount(ROOT_TAG, ImageHost);
    await tick();

    const target = viewNode()?.instanceHandle;
    if (typeof target !== 'object' || target === null)
      throw new Error('no host');
    fabric.fireEvent(target, 'topLoad', { cacheType: 'disk', source: {} });

    expect(handlers.onLoad).toHaveBeenCalledWith({
      cacheType: 'disk',
      source: {},
    });
    expect(handlers.onLoadEnd).toHaveBeenCalledTimes(1);
  });

  it('exposes the view functions on the component', async () => {
    mount(ROOT_TAG, ImageHost);
    await tick();

    await host?.view?.reloadAsync();

    expect(reloadAsync).toHaveBeenCalledTimes(1);
  });
});

describe('ImageBackground', () => {
  it('paints the image and the projected content inside one view', async () => {
    mount(ROOT_TAG, BackgroundHost);
    await tick();

    const image = viewNode();
    expect(image ? live.nodeOf(image.handle).payload : {}).toMatchObject({
      source: [{ uri: 'a' }],
    });
    expect(fabric.find(node => node.props.testID === 'over')).toBeDefined();
  });
});

describe('injectImage', () => {
  it('loads and releases the old image when the source changes', async () => {
    const first = { release: vi.fn() };
    const second = { release: vi.fn() };
    loadImageAsync.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    mount(ROOT_TAG, InjectHost);
    await vi.waitFor(() => expect(held.image?.()).toBe(first));

    source.set('https://x/b.png');
    await vi.waitFor(() => expect(held.image?.()).toBe(second));

    expect(first.release).toHaveBeenCalledTimes(1);
    expect(loadImageAsync).toHaveBeenCalledWith('https://x/a.png', {
      maxWidth: 10,
    });
  });
});
