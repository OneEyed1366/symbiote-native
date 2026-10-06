// Svelte `Image`, `ImageBackground` and `useImage` through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

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

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_951;
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

let harness = createSvelteHarness('image');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  harness = createSvelteHarness('image');
  platform.OS = 'ios';
  Reflect.set(globalThis, '__DEV__', true);
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

async function mountSource(name: string, source: string): Promise<void> {
  const app = harness.compileSource(__dirname, name, source);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

function viewNode(): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === VIEW_NAME);
}

function readGlobal(name: string): (...args: unknown[]) => unknown {
  const value: unknown = Reflect.get(globalThis, name);
  if (typeof value !== 'function') throw new Error(`${name} was not set`);
  return (...args) => value(...args);
}

const IMAGE_APP = `<script lang="ts">
   import Image from './image.svelte';
   let view = $state();
   globalThis.__imageView = () => view;
 </script>
 <Image
   bind:this={view}
   source="https://x/a.png"
   contentFit="contain"
   onLoad={globalThis.__onLoad}
   onLoadEnd={globalThis.__onLoadEnd}
 />`;

describe('Image', () => {
  it('paints the native view with resolved props', async () => {
    await mountSource('props-app', IMAGE_APP);

    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      source: [{ uri: 'https://x/a.png' }],
      contentFit: 'contain',
    });
  });

  it('hands `onLoad` the payload and then calls `onLoadEnd`', async () => {
    const calls: string[] = [];
    Reflect.set(globalThis, '__onLoad', (event: { cacheType: string }) =>
      calls.push(`load:${event.cacheType}`),
    );
    Reflect.set(globalThis, '__onLoadEnd', () => calls.push('end'));
    await mountSource('load-app', IMAGE_APP);

    const target = viewNode()?.instanceHandle;
    if (typeof target !== 'object' || target === null)
      throw new Error('no host');
    fabric.fireEvent(target, 'topLoad', { cacheType: 'disk', source: {} });

    expect(calls).toEqual(['load:disk', 'end']);
  });

  it('exposes the view functions on the instance', async () => {
    await mountSource('handle-app', IMAGE_APP);

    const view: unknown = readGlobal('__imageView')();
    const reload: unknown = Reflect.get(Object(view), 'reloadAsync');
    if (typeof reload !== 'function') throw new Error('no reloadAsync');
    await reload();

    expect(reloadAsync).toHaveBeenCalledTimes(1);
  });
});

describe('ImageBackground', () => {
  it('paints the image and the children inside one view', async () => {
    await mountSource(
      'background-app',
      `<script lang="ts">
         import ImageBackground from './image-background.svelte';
       </script>
       <ImageBackground source="a" style={{ width: 10 }}>
         <view testID="over" />
       </ImageBackground>`,
    );

    const image = viewNode();
    expect(image ? live.nodeOf(image.handle).payload : {}).toMatchObject({
      source: [{ uri: 'a' }],
    });
    expect(fabric.find(node => node.props.testID === 'over')).toBeDefined();
  });
});

const USE_IMAGE_APP = `<script lang="ts">
   import { useImage } from './use-image.svelte';
   let source = $state('https://x/a.png');
   const image = useImage(() => source, () => ({ maxWidth: 10 }));
   Object.assign(globalThis, {
     __image: () => image.current,
     __setSource: (value) => { source = value; },
   });
 </script>`;

describe('useImage', () => {
  it('loads and releases the old image when the source changes', async () => {
    const first = { release: vi.fn() };
    const second = { release: vi.fn() };
    loadImageAsync.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    await mountSource('use-image-app', USE_IMAGE_APP);
    await vi.waitFor(() => expect(readGlobal('__image')()).toBe(first));

    readGlobal('__setSource')('https://x/b.png');
    await vi.waitFor(() => expect(readGlobal('__image')()).toBe(second));

    expect(first.release).toHaveBeenCalledTimes(1);
    expect(loadImageAsync).toHaveBeenCalledWith('https://x/a.png', {
      maxWidth: 10,
    });
  });
});
