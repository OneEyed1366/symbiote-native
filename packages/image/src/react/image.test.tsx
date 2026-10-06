// React `Image` and `ImageBackground` over the recording fabric with an injected view config

import { createElement, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { IImageViewHandle } from '../core';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const reloadAsync = vi.hoisted(() => vi.fn(async () => undefined));

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

const ROOT_TAG = 2011;
const VIEW_NAME = 'ViewManagerAdapter_ExpoImage';

const fabric = installRecordingFabric();
setNativeViewConfigSource(name =>
  name === VIEW_NAME
    ? {
        directEventTypes: {
          topLoad: { registrationName: 'onLoad' },
          topError: { registrationName: 'onError' },
        },
        validAttributes: { source: true, contentFit: true, placeholder: true },
      }
    : undefined,
);

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
  it('paints the native view with resolved props', () => {
    mount(
      ROOT_TAG,
      createElement(Image, {
        source: 'https://x/a.png',
        contentFit: 'contain',
      }),
    );

    expect(viewNode()?.props).toMatchObject({
      source: [{ uri: 'https://x/a.png' }],
      contentFit: 'contain',
    });
  });

  it('gives the handle through `ref` and calls the view function on the host node', async () => {
    const ref = createRef<IImageViewHandle>();
    mount(ROOT_TAG, createElement(Image, { ref, source: 'a' }));

    await ref.current?.reloadAsync();

    expect(reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('hands `onLoad` the payload and then calls `onLoadEnd`', () => {
    const calls: string[] = [];
    mount(
      ROOT_TAG,
      createElement(Image, {
        source: 'a',
        onLoad: event => calls.push(`load:${event.cacheType}`),
        onLoadEnd: () => calls.push('end'),
      }),
    );

    const target = viewNode()?.instanceHandle;
    if (typeof target !== 'object' || target === null)
      throw new Error('no host');
    fabric.fireEvent(target, 'topLoad', { cacheType: 'memory', source: {} });

    expect(calls).toEqual(['load:memory', 'end']);
  });

  it('paints nothing when the view cannot register', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });
    mount(ROOT_TAG, createElement(Image, { source: 'a' }));

    expect(viewNode()).toBeUndefined();
    expect(warn).toHaveBeenCalledWith("'Image' is not available.");
  });
});

describe('ImageBackground', () => {
  it('paints the image under the children of the app', () => {
    mount(
      ROOT_TAG,
      createElement(
        ImageBackground,
        { source: 'a', style: { width: 10 } },
        createElement('text', { testID: 'over' }, 'over'),
      ),
    );

    const image = viewNode();
    expect(image?.props).toMatchObject({ source: [{ uri: 'a' }] });
    expect(fabric.find(node => node.props.testID === 'over')).toBeDefined();
  });
});
