import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NESTED_SETTINGS,
  innerStackStyleOf,
  NESTED_TAB_NAMES,
  nestedOptionsOf,
  nestedTabOptionsOf,
  readNestedSettings,
} from './nested-settings';

describe('nested navigator settings', () => {
  describe('Positive', () => {
    it('reads the defaults when the route has no params', () => {
      expect(readNestedSettings(undefined)).toEqual(DEFAULT_NESTED_SETTINGS);
    });

    it('starts with both headers on, so the double header is the first thing seen', () => {
      expect(DEFAULT_NESTED_SETTINGS.isParentHeader).toBe(true);
      expect(nestedOptionsOf(DEFAULT_NESTED_SETTINGS).headerShown).toBe(true);
    });

    it('hides the header of the parent screen on request', () => {
      const settings = readNestedSettings({ isParentHeader: false });
      expect(nestedOptionsOf(settings).headerShown).toBe(false);
    });

    it('leaves the container colour to the library until one is chosen', () => {
      expect(innerStackStyleOf(DEFAULT_NESTED_SETTINGS)).toBeUndefined();
    });

    it('gives each tab of the outer bar its own label and glyph', () => {
      const options = NESTED_TAB_NAMES.map(nestedTabOptionsOf);
      expect(options.map(option => option.tabBarLabel)).toEqual([
        'Home',
        'Inner',
        'Info',
      ]);
      const glyphs = options.map(option => option.tabBarIcon);
      expect(glyphs.every(glyph => glyph !== undefined)).toBe(true);
      expect(new Set(glyphs).size).toBe(NESTED_TAB_NAMES.length);
    });

    it('turns a container choice into a background colour', () => {
      const style = innerStackStyleOf(
        readNestedSettings({ container: 'tint' }),
      );
      expect(style?.backgroundColor).toMatch(/^#/);
    });
  });

  describe('Negative', () => {
    it('reads a value the panel could not have written as its default', () => {
      const settings = readNestedSettings({
        isParentHeader: 'yes',
        container: 'plaid',
      });
      expect(settings).toEqual(DEFAULT_NESTED_SETTINGS);
    });
  });
});
