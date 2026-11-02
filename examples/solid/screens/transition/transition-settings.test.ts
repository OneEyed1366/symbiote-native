import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSITION_SETTINGS,
  readTransitionSettings,
  transitionOptionsOf,
} from './transition-settings';

describe('transition settings', () => {
  describe('Positive', () => {
    it('reads the defaults when the route has no params', () => {
      expect(readTransitionSettings(undefined)).toEqual(
        DEFAULT_TRANSITION_SETTINGS,
      );
    });

    it('reads what the panel wrote to the route params', () => {
      expect(
        readTransitionSettings({ isTranslucent: true, isLargeTitle: true }),
      ).toEqual({ isTranslucent: true, isLargeTitle: true });
    });

    it('turns the settings into header options', () => {
      expect(
        transitionOptionsOf({ isTranslucent: true, isLargeTitle: false }),
      ).toMatchObject({ headerTranslucent: true, headerLargeTitle: false });
    });
  });

  describe('Negative', () => {
    it('falls back to the default for a value the panel could not have written', () => {
      expect(
        readTransitionSettings({ isTranslucent: 'yes', isLargeTitle: 1 }),
      ).toEqual(DEFAULT_TRANSITION_SETTINGS);
    });
  });
});
