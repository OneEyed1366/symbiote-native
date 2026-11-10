import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEADER_VIEWS_SETTINGS,
  headerOptionsOf,
  navBarFillOf,
  readHeaderViewsSettings,
} from './header-views-settings';
import type { IHeaderViewsSettings } from './header-views-settings';

describe('header views settings', () => {
  describe('Positive', () => {
    it('starts from the defaults when the route carries no params', () => {
      expect(readHeaderViewsSettings(undefined)).toEqual(
        DEFAULT_HEADER_VIEWS_SETTINGS,
      );
    });

    it('reads back the settings a panel wrote with setParams', () => {
      const written: IHeaderViewsSettings = {
        ...DEFAULT_HEADER_VIEWS_SETTINGS,
        backDisplayMode: 'minimal',
        isBackVisible: false,
        blur: 'systemMaterial',
      };
      expect(readHeaderViewsSettings(written)).toEqual(written);
    });

    it('remembers which header view was tapped last', () => {
      expect(readHeaderViewsSettings({ lastTap: 'right' }).lastTap).toBe(
        'right',
      );
      expect(DEFAULT_HEADER_VIEWS_SETTINGS.lastTap).toBe('nothing yet');
    });

    it('turns the custom back title into the text, the default into none', () => {
      const custom: IHeaderViewsSettings = {
        ...DEFAULT_HEADER_VIEWS_SETTINGS,
        backTitle: 'custom',
      };
      expect(headerOptionsOf(custom).headerBackTitle).toBe('Menu');
      expect(
        headerOptionsOf(DEFAULT_HEADER_VIEWS_SETTINGS).headerBackTitle,
      ).toBeUndefined();
    });

    it('leaves the direction to the system until a side is chosen', () => {
      const rtl: IHeaderViewsSettings = {
        ...DEFAULT_HEADER_VIEWS_SETTINGS,
        direction: 'rtl',
      };
      expect(headerOptionsOf(rtl).headerDirection).toBe('rtl');
      expect(
        headerOptionsOf(DEFAULT_HEADER_VIEWS_SETTINGS).headerDirection,
      ).toBeUndefined();
    });

    it('sets the title styles together and only while the switch is on', () => {
      const styled = { ...DEFAULT_HEADER_VIEWS_SETTINGS, isTitleStyled: true };
      const options = headerOptionsOf(styled);
      expect(options.headerTitleStyle).toBeDefined();
      expect(options.headerBackTitleStyle).toBeDefined();
      expect(options.headerLargeTitleStyle).toBeDefined();
      expect(
        headerOptionsOf(DEFAULT_HEADER_VIEWS_SETTINGS).headerTitleStyle,
      ).toBeUndefined();
    });

    // The native bar fills its background before the blur, so only a transparent one shows the blur
    it('makes the bar background transparent while the header is translucent', () => {
      const translucent = {
        ...DEFAULT_HEADER_VIEWS_SETTINGS,
        isTranslucent: true,
      };
      expect(navBarFillOf(translucent)).toEqual({
        backgroundColor: 'transparent',
      });
    });

    it('keeps a solid bar colour while the header is not translucent', () => {
      const color = navBarFillOf(
        DEFAULT_HEADER_VIEWS_SETTINGS,
      )?.backgroundColor;
      expect(color).toBeDefined();
      expect(color).not.toBe('transparent');
    });

    it('passes the switches through under the option they are named for', () => {
      const options = headerOptionsOf({
        ...DEFAULT_HEADER_VIEWS_SETTINGS,
        isTranslucent: true,
        isShadowVisible: false,
        isLargeShadowVisible: false,
        isBackMenuEnabled: false,
        isLeftBackgroundVisible: false,
      });
      expect(options.headerTranslucent).toBe(true);
      expect(options.headerShadowVisible).toBe(false);
      expect(options.headerLargeTitleShadowVisible).toBe(false);
      expect(options.headerBackButtonMenuEnabled).toBe(false);
      expect(options.headerLeftBackgroundVisible).toBe(false);
    });
  });

  describe('Negative', () => {
    it('falls back to the default for a value the panel could never write', () => {
      const read = readHeaderViewsSettings({
        backDisplayMode: 'huge',
        isTranslucent: 'yes',
        blur: 42,
      });
      expect(read.backDisplayMode).toBe(
        DEFAULT_HEADER_VIEWS_SETTINGS.backDisplayMode,
      );
      expect(read.isTranslucent).toBe(
        DEFAULT_HEADER_VIEWS_SETTINGS.isTranslucent,
      );
      expect(read.blur).toBe(DEFAULT_HEADER_VIEWS_SETTINGS.blur);
    });

    it('ignores a last tap that is not text', () => {
      expect(readHeaderViewsSettings({ lastTap: 7 }).lastTap).toBe(
        DEFAULT_HEADER_VIEWS_SETTINGS.lastTap,
      );
    });

    it('reads params that are not an object as no params', () => {
      expect(readHeaderViewsSettings('settings')).toEqual(
        DEFAULT_HEADER_VIEWS_SETTINGS,
      );
      expect(readHeaderViewsSettings(null)).toEqual(
        DEFAULT_HEADER_VIEWS_SETTINGS,
      );
    });
  });
});
