import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INSETS_SETTINGS,
  insetsOptionsOf,
  readInsetsSettings,
} from './insets-settings';
import type { IInsetsSettings } from './insets-settings';

function settingsWith(patch: Partial<IInsetsSettings>): IInsetsSettings {
  return { ...DEFAULT_INSETS_SETTINGS, ...patch };
}

describe('insets settings', () => {
  describe('Positive', () => {
    it('reads the defaults when the route has no params', () => {
      expect(readInsetsSettings(undefined)).toEqual(DEFAULT_INSETS_SETTINGS);
    });

    it('reads what the panel wrote to the route params', () => {
      const written = settingsWith({
        statusBarStyle: 'light',
        isStatusBarHidden: true,
        screenOrientation: 'landscape',
        bottomEdge: 'inset',
        topEffect: 'soft',
        disabledInset: 'left',
      });
      expect(readInsetsSettings({ ...written })).toEqual(written);
    });

    it('maps the status bar, the bars and the orientation straight to options', () => {
      const options = insetsOptionsOf(
        settingsWith({
          statusBarStyle: 'dark',
          isStatusBarHidden: true,
          statusBarAnimation: 'slide',
          screenOrientation: 'portrait',
          isHomeIndicatorHidden: true,
          isNavigationBarHidden: true,
        }),
      );
      expect(options).toMatchObject({
        statusBarStyle: 'dark',
        statusBarHidden: true,
        statusBarAnimation: 'slide',
        screenOrientation: 'portrait',
        homeIndicatorHidden: true,
        navigationBarHidden: true,
      });
    });

    it('leaves the status bar options out where the host app cannot take them', () => {
      const options = insetsOptionsOf(
        settingsWith({ statusBarStyle: 'dark', isStatusBarHidden: true }),
        false,
      );
      expect(options).not.toHaveProperty('statusBarStyle');
      expect(options).not.toHaveProperty('statusBarHidden');
      expect(options).not.toHaveProperty('statusBarAnimation');
      expect(options.screenOrientation).toBe('default');
    });

    it('sends only the safe area edges the panel changed', () => {
      const options = insetsOptionsOf(
        settingsWith({ bottomEdge: 'inset', leftEdge: 'ignore' }),
      );
      expect(options.safeAreaEdges).toEqual({ bottom: true, left: false });
    });

    it('sends no safe area edges while every edge keeps its default', () => {
      expect(
        insetsOptionsOf(DEFAULT_INSETS_SETTINGS).safeAreaEdges,
      ).toBeUndefined();
    });

    it('spreads the sides choice over the left and right scroll edges', () => {
      const options = insetsOptionsOf(
        settingsWith({ topEffect: 'hard', sideEffect: 'hidden' }),
      );
      expect(options.scrollEdgeEffects).toEqual({
        top: 'hard',
        bottom: 'automatic',
        left: 'hidden',
        right: 'hidden',
      });
    });

    it('sends no scroll edge effects while every edge stays automatic', () => {
      expect(
        insetsOptionsOf(DEFAULT_INSETS_SETTINGS).scrollEdgeEffects,
      ).toBeUndefined();
    });

    it('opts out of exactly the one inset the panel names', () => {
      const options = insetsOptionsOf(settingsWith({ disabledInset: 'right' }));
      expect(options).toMatchObject({ disableRightInsetApplication: true });
      expect(options.disableTopInsetApplication).toBeUndefined();
      expect(options.disableLeftInsetApplication).toBeUndefined();
      expect(options.disableBottomInsetApplication).toBeUndefined();
    });

    it('sets the colours that Android 15 ignores only when the panel asks', () => {
      expect(
        insetsOptionsOf(DEFAULT_INSETS_SETTINGS).statusBarColor,
      ).toBeUndefined();
      expect(
        insetsOptionsOf(settingsWith({ isLegacyColorSet: true })),
      ).toMatchObject({
        statusBarColor: expect.any(String),
        statusBarTranslucent: true,
        navigationBarColor: expect.any(String),
        navigationBarTranslucent: true,
        headerTopInsetEnabled: false,
      });
    });

    it('passes the header appearance through', () => {
      expect(
        insetsOptionsOf(settingsWith({ headerStyle: 'light' }))
          .headerUserInterfaceStyle,
      ).toBe('light');
    });
  });

  describe('Negative', () => {
    it('falls back to the default for a value the panel could not have written', () => {
      expect(
        readInsetsSettings({
          statusBarStyle: 'neon',
          isStatusBarHidden: 'yes',
          screenOrientation: 7,
          topEdge: 'maybe',
          sideEffect: null,
          disabledInset: 'everything',
        }),
      ).toEqual(DEFAULT_INSETS_SETTINGS);
    });
  });
});
