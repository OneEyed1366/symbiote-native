// Framework-agnostic half of `LivePhotoView`, an Expo native view with start and stop functions

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
const startPlayback = vi.hoisted(() => vi.fn());
const stopPlayback = vi.hoisted(() => vi.fn());
const requireNativeModule = vi.hoisted(() =>
  vi.fn(() => ({
    ViewPrototypes: { ExpoLivePhoto: { startPlayback, stopPlayback } },
  })),
);

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireNativeModule,
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(
        `The method or property ${moduleName}.${propertyName} is not available`,
      );
    }
  },
}));

const {
  createLivePhotoViewHandle,
  ensureLivePhotoViewRegistered,
  livePhotoViewName,
  renderLivePhotoView,
} = await import('./live-photo-view');

installRecordingFabric();

const SOURCE = { photoUri: 'file:///a.heic', pairedVideoUri: 'file:///a.mov' };
let nextRootTag = 9800;

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
});

afterEach(() => {
  warn.mockRestore();
  Reflect.deleteProperty(globalThis, '__DEV__');
});

describe('livePhotoViewName', () => {
  it('names the Expo view-manager adapter after the module', () => {
    expect(livePhotoViewName()).toBe('ViewManagerAdapter_ExpoLivePhoto');
  });
});

describe('ensureLivePhotoViewRegistered', () => {
  it('registers the view of the module on iOS', () => {
    expect(ensureLivePhotoViewRegistered()).toBe(true);
    expect(requireNativeViewManager).toHaveBeenCalledWith('ExpoLivePhoto');
  });

  it('does not touch the native view manager off iOS', () => {
    platform.OS = 'android';

    expect(ensureLivePhotoViewRegistered()).toBe(false);
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});

describe('renderLivePhotoView', () => {
  it('renders the native view with the props it was given', () => {
    const onPlaybackStart = vi.fn();

    const descriptor = renderLivePhotoView({
      source: SOURCE,
      isMuted: false,
      contentFit: 'cover',
      onPlaybackStart,
    });

    expect(descriptor?.type).toBe('ViewManagerAdapter_ExpoLivePhoto');
    expect(descriptor?.props).toMatchObject({
      source: SOURCE,
      isMuted: false,
      contentFit: 'cover',
      onPlaybackStart,
    });
  });

  it('hands onLoadError the native payload, not the event', () => {
    const onLoadError = vi.fn();
    const descriptor = renderLivePhotoView({ onLoadError });
    const nativeHandler: unknown = descriptor?.props['onLoadError'];

    if (typeof nativeHandler !== 'function') throw new Error('no handler');
    nativeHandler({ nativeEvent: { message: 'broken pair' } });

    expect(onLoadError).toHaveBeenCalledWith({ message: 'broken pair' });
  });

  it('renders nothing and warns in a dev build off iOS', () => {
    platform.OS = 'android';

    expect(renderLivePhotoView({ source: SOURCE })).toBeNull();
    expect(warn).toHaveBeenCalledWith("'LivePhotoView' is not available.");
  });
});

describe('createLivePhotoViewHandle (Positive)', () => {
  it('plays the full video unless a style is given', () => {
    const node = mountedNode();
    const handle = createLivePhotoViewHandle(() => node);

    handle.startPlayback();
    handle.startPlayback('hint');

    expect(startPlayback).toHaveBeenNthCalledWith(1, 'full');
    expect(startPlayback).toHaveBeenNthCalledWith(2, 'hint');
  });

  it('stops the playback', () => {
    const node = mountedNode();

    createLivePhotoViewHandle(() => node).stopPlayback();

    expect(stopPlayback).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the view has not mounted yet', () => {
    const handle = createLivePhotoViewHandle(() => null);

    handle.startPlayback();
    handle.stopPlayback();

    expect(startPlayback).not.toHaveBeenCalled();
    expect(stopPlayback).not.toHaveBeenCalled();
  });
});

describe('createLivePhotoViewHandle (Negative)', () => {
  it('throws the unavailability error off iOS, for both functions', () => {
    platform.OS = 'android';
    const handle = createLivePhotoViewHandle(() => mountedNode());

    expect(() => handle.startPlayback()).toThrow(
      'expo-live-photo.startPlayback is not available',
    );
    expect(() => handle.stopPlayback()).toThrow(
      'expo-live-photo.stopPlayback is not available',
    );
  });
});
