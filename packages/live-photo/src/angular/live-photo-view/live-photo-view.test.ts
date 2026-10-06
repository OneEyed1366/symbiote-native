// Angular `LivePhotoView` over the recording fabric with an injected view config

import '@angular/compiler';
import { Component, ViewChild } from '@angular/core';
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

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const startPlayback = vi.hoisted(() => vi.fn());
const stopPlayback = vi.hoisted(() => vi.fn());
const handlers = vi.hoisted(() => ({
  onPlaybackStart: vi.fn(),
  onLoadError: vi.fn(),
}));

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireNativeModule: () => ({
    ViewPrototypes: { ExpoLivePhoto: { startPlayback, stopPlayback } },
  }),
  UnavailabilityError: class UnavailabilityError extends Error {},
}));

const { LivePhotoView } = await import('.');

const ROOT_TAG = 1715;
const VIEW_NAME = 'ViewManagerAdapter_ExpoLivePhoto';
const SOURCE = { photoUri: 'file:///a.heic', pairedVideoUri: 'file:///a.mov' };

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === VIEW_NAME
    ? {
        directEventTypes: {
          topPlaybackStart: { registrationName: 'onPlaybackStart' },
          topLoadError: { registrationName: 'onLoadError' },
        },
        validAttributes: { source: true, isMuted: true, contentFit: true },
      }
    : undefined,
);

let host: HostFixture | undefined;

@Component({
  selector: 'live-photo-host',
  standalone: true,
  imports: [LivePhotoView],
  template: `<LivePhotoView
    [source]="source"
    [isMuted]="false"
    contentFit="cover"
    [onPlaybackStart]="onPlaybackStart"
    [onLoadError]="onLoadError"
  />`,
})
class HostFixture {
  @ViewChild(LivePhotoView) view?: InstanceType<typeof LivePhotoView>;
  readonly source = SOURCE;
  readonly onPlaybackStart = handlers.onPlaybackStart;
  readonly onLoadError = handlers.onLoadError;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }
}

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function mountHost(): Promise<void> {
  mount(ROOT_TAG, HostFixture);
  await tick();
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  platform.OS = 'ios';
  host = undefined;
});

afterEach(() => unmount(ROOT_TAG));

function viewNode(): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === VIEW_NAME);
}

function fire(eventName: string, payload: Record<string, unknown>): void {
  const target = viewNode()?.instanceHandle;
  if (typeof target === 'object' && target !== null) {
    fabric.fireEvent(target, eventName, payload);
  }
}

describe('LivePhotoView (Positive)', () => {
  it('paints the native view with its inputs on iOS', async () => {
    await mountHost();

    const node = viewNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      source: SOURCE,
      isMuted: false,
      contentFit: 'cover',
    });
  });

  it('calls onPlaybackStart when the native view starts playing', async () => {
    await mountHost();

    fire('topPlaybackStart', {});

    expect(handlers.onPlaybackStart).toHaveBeenCalledTimes(1);
  });

  it('hands onLoadError the native payload', async () => {
    await mountHost();

    fire('topLoadError', { message: 'broken pair' });

    expect(handlers.onLoadError).toHaveBeenCalledWith({
      message: 'broken pair',
    });
  });

  it('starts and stops the playback of the mounted view through the component', async () => {
    await mountHost();

    host?.view?.startPlayback('hint');
    host?.view?.stopPlayback();

    expect(startPlayback).toHaveBeenCalledWith('hint');
    expect(startPlayback.mock.contexts[0]).toEqual({
      nativeTag: expect.any(Number),
    });
    expect(stopPlayback).toHaveBeenCalledTimes(1);
  });
});

describe('LivePhotoView (Negative)', () => {
  it('renders nothing on Android', async () => {
    platform.OS = 'android';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await mountHost();

    expect(viewNode()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
