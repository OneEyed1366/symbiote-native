import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
}));

const { renderVideoAirPlayButton, videoAirPlayButtonViewName } =
  await import('./video-airplay-button');

const MIN_SIZE = { minWidth: 30, minHeight: 30 };

beforeEach(() => {
  vi.clearAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  Reflect.deleteProperty(globalThis, 'expo');
});

describe('renderVideoAirPlayButton (Positive)', () => {
  it('names the Expo view-manager adapter after the module and the view', () => {
    expect(videoAirPlayButtonViewName()).toBe(
      'ViewManagerAdapter_ExpoVideo_VideoAirPlayButtonView',
    );
  });

  it('paints the native route picker on iOS with a minimum size under the style', () => {
    const style = { width: 44 };

    const descriptor = renderVideoAirPlayButton({
      tint: 'red',
      prioritizeVideoDevices: false,
      style,
    });

    expect(descriptor.type).toBe(
      'ViewManagerAdapter_ExpoVideo_VideoAirPlayButtonView',
    );
    expect(descriptor.props).toMatchObject({
      tint: 'red',
      prioritizeVideoDevices: false,
      style: [MIN_SIZE, style],
    });
    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoVideo',
      'VideoAirPlayButtonView',
    );
  });

  it('falls back to a plain view with the minimum size off iOS', () => {
    platform.OS = 'android';

    const descriptor = renderVideoAirPlayButton({ testID: 'airplay' });

    expect(descriptor.type).toBe('view');
    expect(descriptor.props).toMatchObject({
      testID: 'airplay',
      style: [MIN_SIZE, undefined],
    });
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});

describe('renderVideoAirPlayButton (Negative)', () => {
  it('keeps the AirPlay props off the plain view, a function prop must not reach Fabric', () => {
    platform.OS = 'android';

    const { props } = renderVideoAirPlayButton({
      tint: 'red',
      activeTint: 'blue',
      prioritizeVideoDevices: true,
      onBeginPresentingRoutes: vi.fn(),
      onEndPresentingRoutes: vi.fn(),
    });

    expect(Object.keys(props)).toEqual(['style']);
  });

  it('falls back to the plain view when the native view cannot register', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });

    expect(renderVideoAirPlayButton({}).type).toBe('view');
  });
});
