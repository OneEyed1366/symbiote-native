import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GESTURES_SETTINGS,
  gestureOptionsOf,
  readGesturesSettings,
} from './gestures-settings';
import type { IGesturesSettings } from './gestures-settings';

const WINDOW = { width: 400, height: 800 };

function withSettings(patch: Partial<IGesturesSettings>): IGesturesSettings {
  return { ...DEFAULT_GESTURES_SETTINGS, ...patch };
}

describe('gestures settings', () => {
  describe('Positive', () => {
    it('starts from the defaults when the route carries no params', () => {
      expect(readGesturesSettings(undefined)).toEqual(
        DEFAULT_GESTURES_SETTINGS,
      );
    });

    it('reads back the settings a panel wrote with setParams', () => {
      const written = withSettings({
        isGestureEnabled: false,
        swipeDirection: 'vertical',
        area: 'bottomHalf',
        dismissAttempts: 3,
      });
      expect(readGesturesSettings(written)).toEqual(written);
    });

    it('presents the screen as a modal only when it was pushed as one', () => {
      expect(
        gestureOptionsOf(withSettings({ isModal: true }), WINDOW)
          .stackPresentation,
      ).toBe('modal');
      expect(
        gestureOptionsOf(DEFAULT_GESTURES_SETTINGS, WINDOW).stackPresentation,
      ).toBeUndefined();
    });

    it('passes each switch through under the option it is named for', () => {
      const options = gestureOptionsOf(
        withSettings({
          isGestureEnabled: false,
          isFullScreenSwipe: true,
          isFullScreenShadow: false,
          isCustomAnimation: true,
          isKeyboardHidden: true,
          isDismissPrevented: true,
          isNativeBackDismissal: true,
        }),
        WINDOW,
      );
      expect(options.gestureEnabled).toBe(false);
      expect(options.fullScreenSwipeEnabled).toBe(true);
      expect(options.fullScreenSwipeShadowEnabled).toBe(false);
      expect(options.customAnimationOnSwipe).toBe(true);
      expect(options.hideKeyboardOnSwipe).toBe(true);
      expect(options.preventNativeDismiss).toBe(true);
      expect(options.nativeBackButtonDismissalEnabled).toBe(true);
    });

    it('leaves the whole screen to the swipe until an area is chosen', () => {
      expect(
        gestureOptionsOf(DEFAULT_GESTURES_SETTINGS, WINDOW)
          .gestureResponseDistance,
      ).toBeUndefined();
    });

    it('limits the swipe to the lower half of the window', () => {
      const options = gestureOptionsOf(
        withSettings({ area: 'bottomHalf' }),
        WINDOW,
      );
      expect(options.gestureResponseDistance).toEqual({
        start: 0,
        end: 400,
        top: 400,
        bottom: 800,
      });
    });

    it('limits the swipe to the middle column of the window', () => {
      const options = gestureOptionsOf(
        withSettings({ area: 'centerColumn' }),
        WINDOW,
      );
      expect(options.gestureResponseDistance).toEqual({
        start: 100,
        end: 300,
        top: 0,
        bottom: 800,
      });
    });
  });

  describe('Negative', () => {
    it('falls back to the default for a value the panel could never write', () => {
      const read = readGesturesSettings({
        swipeDirection: 'diagonal',
        area: 7,
        isGestureEnabled: 'no',
        dismissAttempts: 'many',
      });
      expect(read).toEqual(DEFAULT_GESTURES_SETTINGS);
    });

    it('reads params that are not an object as no params', () => {
      expect(readGesturesSettings(null)).toEqual(DEFAULT_GESTURES_SETTINGS);
      expect(readGesturesSettings('gestures')).toEqual(
        DEFAULT_GESTURES_SETTINGS,
      );
    });
  });
});
