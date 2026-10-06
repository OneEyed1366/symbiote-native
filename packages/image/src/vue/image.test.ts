// Vue `Image`, `ImageBackground` and `useImage` over the recording fabric

import {
  defineComponent,
  h,
  nextTick,
  ref,
  type VNode,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/vue';
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

const ROOT_TAG = 2211;
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

let handle: IImageViewHandle | null = null;

function isHandle(value: unknown): value is IImageViewHandle {
  return typeof Reflect.get(Object(value), 'reloadAsync') === 'function';
}

async function mountView(attrs: Record<string, unknown>): Promise<void> {
  const Host = defineComponent(
    () => (): VNode =>
      h(Image, {
        ...attrs,
        ref: (instance: unknown) => {
          handle = isHandle(instance) ? instance : null;
        },
      }),
  );
  mount(ROOT_TAG, { render: (): VNode => h(Host) });
  await tick();
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  handle = null;
  Reflect.set(globalThis, '__DEV__', true);
});

afterEach(() => unmount(ROOT_TAG));

function viewNode(): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === VIEW_NAME);
}

describe('Image', () => {
  it('paints the native view with resolved props', async () => {
    await mountView({ source: 'https://x/a.png', contentFit: 'contain' });

    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      source: [{ uri: 'https://x/a.png' }],
      contentFit: 'contain',
    });
  });

  it('hands `onLoad` the payload and then calls `onLoadEnd`', async () => {
    const calls: string[] = [];
    await mountView({
      source: 'a',
      onLoad: (event: { cacheType: string }) =>
        calls.push(`load:${event.cacheType}`),
      onLoadEnd: () => calls.push('end'),
    });

    const target = viewNode()?.instanceHandle;
    if (typeof target !== 'object' || target === null)
      throw new Error('no host');
    fabric.fireEvent(target, 'topLoad', { cacheType: 'disk', source: {} });

    expect(calls).toEqual(['load:disk', 'end']);
  });

  it('exposes the handle that calls the view function', async () => {
    await mountView({ source: 'a' });

    await handle?.reloadAsync();

    expect(reloadAsync).toHaveBeenCalledTimes(1);
  });
});

describe('ImageBackground', () => {
  it('paints the image and the default slot inside one view', async () => {
    const Host = defineComponent(
      () => (): VNode =>
        h(
          ImageBackground,
          { source: 'a', style: { width: 10 } },
          { default: () => h('view', { testID: 'over' }) },
        ),
    );
    mount(ROOT_TAG, { render: (): VNode => h(Host) });
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
    const source = ref('https://x/a.png');
    let image: ReturnType<typeof useImage> | undefined;
    const Probe = defineComponent(() => {
      image = useImage(source, { maxWidth: 10 });
      return (): VNode => h('view');
    });
    mount(ROOT_TAG, { render: (): VNode => h(Probe) });
    expect(image?.value).toBeNull();

    await vi.waitFor(() => expect(image?.value).toBe(first));
    source.value = 'https://x/b.png';
    await nextTick();
    await vi.waitFor(() => expect(image?.value).toBe(second));

    expect(first.release).toHaveBeenCalledTimes(1);
    expect(loadImageAsync).toHaveBeenCalledWith('https://x/a.png', {
      maxWidth: 10,
    });
  });

  it('releases the image when the owner unmounts', async () => {
    const loaded = { release: vi.fn() };
    loadImageAsync.mockResolvedValue(loaded);
    let image: ReturnType<typeof useImage> | undefined;
    const Probe = defineComponent(() => {
      image = useImage('a');
      return (): VNode => h('view');
    });
    mount(ROOT_TAG, { render: (): VNode => h(Probe) });
    await vi.waitFor(() => expect(image?.value).toBe(loaded));

    unmount(ROOT_TAG);

    expect(loaded.release).toHaveBeenCalledTimes(1);
  });
});
