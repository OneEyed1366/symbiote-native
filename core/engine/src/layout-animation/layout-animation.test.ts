// RN's `LayoutAnimation` through the host, dispatching to a fake Fabric slot
// NOTE: RN caches the slot proxy on first use, so one slot is installed and delegates to `dispatch`

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LayoutAnimation } from '../react-native-host';
import { coerceLayoutAnimationType } from './index';
import type { ILayoutAnimationConfig } from './index';

type IDispatch = (
  config: ILayoutAnimationConfig,
  onSuccess: () => void,
  onError: () => void,
) => void;

const dispatch = vi.fn<IDispatch>();
const PLATFORM_PATH = 'react-native/Libraries/Utilities/Platform.ios';

beforeAll(() => {
  Object.assign(globalThis, {
    nativeFabricUIManager: {
      configureNextLayoutAnimation: (...args: Parameters<IDispatch>) =>
        dispatch(...args),
    },
  });
});

afterEach(() => {
  dispatch.mockReset();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function lastDispatch() {
  const [config, onSuccess, onError] = dispatch.mock.lastCall ?? [];
  return { config, onSuccess, onError };
}

describe('LayoutAnimation', () => {
  describe('Positive (presets and config)', () => {
    it('easeInEaseOut fades with an easeInEaseOut curve over 300 ms', () => {
      expect(LayoutAnimation.Presets.easeInEaseOut).toMatchObject({
        duration: 300,
        create: { type: 'easeInEaseOut', property: 'opacity' },
        update: { type: 'easeInEaseOut' },
        delete: { type: 'easeInEaseOut', property: 'opacity' },
      });
    });

    it('spring fades linearly in and out but springs the update', () => {
      expect(LayoutAnimation.Presets.spring).toEqual({
        duration: 700,
        create: { type: 'linear', property: 'opacity' },
        update: { type: 'spring', springDamping: 0.4 },
        delete: { type: 'linear', property: 'opacity' },
      });
    });

    it('create builds a config where update carries only the type', () => {
      expect(
        LayoutAnimation.create(
          300,
          LayoutAnimation.Types.linear,
          LayoutAnimation.Properties.scaleXY,
        ),
      ).toEqual({
        duration: 300,
        create: { type: 'linear', property: 'scaleXY' },
        update: { type: 'linear' },
        delete: { type: 'linear', property: 'scaleXY' },
      });
    });
  });

  describe('Positive (dispatch to native)', () => {
    it('hands the config to native and reports the end once', () => {
      vi.useFakeTimers();
      const onEnd = vi.fn();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.linear, onEnd);

      const { config, onSuccess, onError } = lastDispatch();
      expect(config).toBe(LayoutAnimation.Presets.linear);
      onSuccess?.();
      onSuccess?.();
      onError?.();
      vi.advanceTimersByTime(1_000);

      expect(onEnd).toHaveBeenCalledOnce();
    });

    it('reports the end from the duration + 17 ms timer when native never answers', () => {
      vi.useFakeTimers();
      const onEnd = vi.fn();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.linear, onEnd);

      vi.advanceTimersByTime(LayoutAnimation.Presets.linear.duration + 16);
      expect(onEnd).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);

      expect(onEnd).toHaveBeenCalledOnce();
    });

    it('counts a config without a duration as 0 + 17 ms', () => {
      vi.useFakeTimers();
      const onEnd = vi.fn();
      const config: ILayoutAnimationConfig = { create: { type: 'linear' } };
      LayoutAnimation.configureNext(config, onEnd);

      vi.advanceTimersByTime(16);
      expect(onEnd).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);

      expect(onEnd).toHaveBeenCalledOnce();
    });

    it('passes a native config failure to onAnimationDidFail', () => {
      const onFail = vi.fn();
      LayoutAnimation.configureNext(
        LayoutAnimation.Presets.linear,
        undefined,
        onFail,
      );
      lastDispatch().onError?.();

      expect(onFail).toHaveBeenCalledOnce();
    });

    it('each shortcut dispatches its own preset', () => {
      LayoutAnimation.easeInEaseOut();
      expect(lastDispatch().config).toBe(LayoutAnimation.Presets.easeInEaseOut);
      LayoutAnimation.linear();
      expect(lastDispatch().config).toBe(LayoutAnimation.Presets.linear);
      LayoutAnimation.spring();
      expect(lastDispatch().config).toBe(LayoutAnimation.Presets.spring);
    });

    it('does nothing when the platform disables animations', async () => {
      const { default: RnPlatform } = await import(
        /* @vite-ignore */ PLATFORM_PATH
      );
      vi.spyOn(RnPlatform, 'isDisableAnimations', 'get').mockReturnValue(true);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.linear);

      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe('Negative', () => {
    it('checkConfig only logs that it has been disabled', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      LayoutAnimation.checkConfig(LayoutAnimation.Presets.linear, () => {});

      expect(error).toHaveBeenCalledExactlyOnceWith(
        'LayoutAnimation.checkConfig(...) has been disabled.',
      );
    });
  });

  describe('characterization', () => {
    // QUESTION: RN's `setLayoutAnimationEnabled` assigns the flag to itself, a dead switch
    it('[characterization — behavior not confirmed] setEnabled(false) does not stop configureNext', () => {
      LayoutAnimation.setEnabled(false);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.linear);

      expect(dispatch).toHaveBeenCalledOnce();
    });
  });
});

describe('coerceLayoutAnimationType', () => {
  it('keeps an easing that is a known type', () => {
    expect(coerceLayoutAnimationType('linear')).toBe('linear');
    expect(coerceLayoutAnimationType('spring')).toBe('spring');
  });

  it("falls back to 'keyboard' for an easing that is not a type", () => {
    expect(coerceLayoutAnimationType('easeOutCubic')).toBe('keyboard');
    expect(coerceLayoutAnimationType('')).toBe('keyboard');
  });
});
