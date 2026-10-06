// Framework-agnostic half of `VideoView`, an Expo native view with player-bound functions

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { createElement, createSurface } from '@symbiote-native/engine';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const functionsOf = vi.hoisted(() => () => ({
  enterFullscreen: vi.fn(async () => undefined),
  exitFullscreen: vi.fn(async () => undefined),
  startPictureInPicture: vi.fn(async () => undefined),
  stopPictureInPicture: vi.fn(async () => undefined),
}));
const prototypes = vi.hoisted(() => ({
  ExpoVideo_VideoView: functionsOf(),
  ExpoVideo_SurfaceVideoView: functionsOf(),
  ExpoVideo_TextureVideoView: functionsOf(),
}));

vi.mock('expo-modules-core', () => {
  class FakeVideoPlayer {
    __expo_shared_object_id__ = 41;
  }
  return {
    Platform: platform,
    requireNativeViewManager,
    requireNativeModule: () => ({
      VideoPlayer: FakeVideoPlayer,
      ViewPrototypes: prototypes,
    }),
  };
});

const { createVideoView } = await import('./video-view');
const { expoVideo } = await import('./native-module');

installRecordingFabric();

let nextRootTag = 9950;

function mountedNode() {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  Reflect.deleteProperty(globalThis, 'expo');
  Reflect.set(globalThis, '__DEV__', true);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  warn.mockClear();
});

afterEach(() => {
  warn.mockRestore();
  Reflect.deleteProperty(globalThis, '__DEV__');
});

describe('createVideoView render (Positive)', () => {
  it('paints the iOS view with the shared object id of the player', () => {
    const player = new expoVideo.VideoPlayer('a.mp4');

    const descriptor = createVideoView(() => null).render({
      player,
      contentFit: 'cover',
    });

    expect(descriptor?.type).toBe('ViewManagerAdapter_ExpoVideo_VideoView');
    expect(descriptor?.props).toMatchObject({
      player: 41,
      contentFit: 'cover',
    });
    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoVideo',
      'VideoView',
    );
  });

  it('passes a player id given as a number', () => {
    const descriptor = createVideoView(() => null).render({ player: 7 });

    expect(descriptor?.props).toMatchObject({ player: 7 });
  });

  it('sends null for no player', () => {
    const descriptor = createVideoView(() => null).render({});

    expect(descriptor?.props).toMatchObject({ player: null });
  });

  it('keeps the callbacks as they are, native calls them without a payload', () => {
    const onFullscreenEnter = vi.fn();

    const descriptor = createVideoView(() => null).render({
      onFullscreenEnter,
    });

    expect(descriptor?.props['onFullscreenEnter']).toBe(onFullscreenEnter);
  });

  it('paints the surface view on Android', () => {
    platform.OS = 'android';

    const descriptor = createVideoView(() => null).render({});

    expect(descriptor?.type).toBe(
      'ViewManagerAdapter_ExpoVideo_SurfaceVideoView',
    );
  });

  it('paints the texture view on Android when asked for', () => {
    platform.OS = 'android';

    const descriptor = createVideoView(() => null).render({
      surfaceType: 'textureView',
    });

    expect(descriptor?.type).toBe(
      'ViewManagerAdapter_ExpoVideo_TextureVideoView',
    );
  });

  it('ignores the texture surface off Android', () => {
    const descriptor = createVideoView(() => null).render({
      surfaceType: 'textureView',
    });

    expect(descriptor?.type).toBe('ViewManagerAdapter_ExpoVideo_VideoView');
  });
});

describe('createVideoView render (Negative)', () => {
  it('renders nothing and warns in a dev build when the view cannot register', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });

    expect(createVideoView(() => null).render({})).toBeNull();
    expect(warn).toHaveBeenCalledWith("'VideoView' is not available.");
  });
});

describe('createVideoView handle', () => {
  it('calls the functions of the view that was rendered', async () => {
    const node = mountedNode();
    const view = createVideoView(() => node);
    view.render({});

    await view.handle.enterFullscreen();
    await view.handle.exitFullscreen();
    await view.handle.startPictureInPicture();
    await view.handle.stopPictureInPicture();

    const { ExpoVideo_VideoView: called } = prototypes;
    expect(called.enterFullscreen).toHaveBeenCalledTimes(1);
    expect(called.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(called.startPictureInPicture).toHaveBeenCalledTimes(1);
    expect(called.stopPictureInPicture).toHaveBeenCalledTimes(1);
    expect(called.enterFullscreen.mock.contexts[0]).toEqual({
      nativeTag: expect.any(Number),
    });
  });

  it('follows the surface the last render chose on Android', async () => {
    platform.OS = 'android';
    const node = mountedNode();
    const view = createVideoView(() => node);
    view.render({ surfaceType: 'textureView' });

    await view.handle.enterFullscreen();

    expect(
      prototypes.ExpoVideo_TextureVideoView.enterFullscreen,
    ).toHaveBeenCalled();
    expect(
      prototypes.ExpoVideo_SurfaceVideoView.enterFullscreen,
    ).not.toHaveBeenCalled();
  });

  it('answers nothing before the view has mounted', async () => {
    const view = createVideoView(() => null);
    view.render({});

    await view.handle.enterFullscreen();

    expect(
      prototypes.ExpoVideo_VideoView.enterFullscreen,
    ).not.toHaveBeenCalled();
  });
});
