import { describe, expect, it, vi } from 'vitest';
import {
  barItemsOf,
  DEFAULT_HEADER_OPTIONS_SETTINGS,
  headerChromeOptionsOf,
  readHeaderOptionsSettings,
  searchBarOptionsOf,
} from './header-options-settings';
import type { IHeaderOptionsSettings } from './header-options-settings';

function settingsWith(
  patch: Partial<IHeaderOptionsSettings>,
): IHeaderOptionsSettings {
  return { ...DEFAULT_HEADER_OPTIONS_SETTINGS, ...patch };
}

describe('header options settings', () => {
  describe('Positive', () => {
    it('reads the defaults when the route has no params', () => {
      expect(readHeaderOptionsSettings(undefined)).toEqual(
        DEFAULT_HEADER_OPTIONS_SETTINGS,
      );
    });

    it('reads what the panel wrote to the route params', () => {
      const written = settingsWith({
        isLargeTitle: false,
        rightItems: 'submenu',
        placement: 'integratedButton',
        colorTheme: 'light',
        inputType: 'email',
      });
      expect(readHeaderOptionsSettings({ ...written })).toEqual(written);
    });

    it('turns the header switches into header options', () => {
      const options = headerChromeOptionsOf(
        settingsWith({ isLargeTitle: false, isTranslucent: false }),
        vi.fn(),
      );
      expect(options).toMatchObject({
        headerLargeTitle: false,
        headerTranslucent: false,
      });
    });

    it('gives a side with no items no items at all', () => {
      expect(barItemsOf('none', false, vi.fn())).toBeUndefined();
    });

    it('builds a plain button that reports its press', () => {
      const report = vi.fn();
      const [item] = barItemsOf('button', false, report) ?? [];
      expect(item).toMatchObject({ type: 'button' });
      if (item?.type === 'button') item.onPress();
      expect(report).toHaveBeenCalledWith('button: Info');
    });

    it('builds a button with a badge', () => {
      const [item] = barItemsOf('badge', false, vi.fn()) ?? [];
      expect(item).toMatchObject({ type: 'button', badge: { value: '3' } });
    });

    it('builds a menu with a destructive action', () => {
      const [item] = barItemsOf('menu', false, vi.fn()) ?? [];
      expect(item).toMatchObject({ type: 'menu' });
      const actions = item?.type === 'menu' ? item.menu.items : [];
      expect(actions).toContainEqual(
        expect.objectContaining({ type: 'action', destructive: true }),
      );
    });

    it('builds a menu that holds a submenu', () => {
      const [item] = barItemsOf('submenu', false, vi.fn()) ?? [];
      const entries = item?.type === 'menu' ? item.menu.items : [];
      expect(entries.map(entry => entry.type)).toContain('submenu');
    });

    it('puts a spacing item between two buttons when asked', () => {
      const items = barItemsOf('button', true, vi.fn()) ?? [];
      expect(items.map(item => item.type)).toEqual([
        'button',
        'spacing',
        'button',
      ]);
    });

    it('maps the search bar placement and behaviour switches', () => {
      const options = searchBarOptionsOf(
        settingsWith({
          placement: 'stacked',
          isHideWhenScrolling: true,
          isObscureBackground: true,
          isHideNavigationBar: true,
          isAllowToolbarIntegration: true,
          autoCapitalize: 'words',
        }),
      );
      expect(options).toMatchObject({
        placement: 'stacked',
        hideWhenScrolling: true,
        obscureBackground: true,
        hideNavigationBar: true,
        allowToolbarIntegration: true,
        autoCapitalize: 'words',
      });
    });

    it('keeps the platform cancel text until the panel sets one', () => {
      expect(
        searchBarOptionsOf(DEFAULT_HEADER_OPTIONS_SETTINGS).cancelButtonText,
      ).toBeUndefined();
      expect(
        searchBarOptionsOf(settingsWith({ cancelText: 'Done' }))
          .cancelButtonText,
      ).toBe('Done');
    });

    it('sets all five search bar colours from one theme', () => {
      const light = searchBarOptionsOf(settingsWith({ colorTheme: 'light' }));
      const dark = searchBarOptionsOf(settingsWith({ colorTheme: 'dark' }));
      for (const key of [
        'barTintColor',
        'tintColor',
        'textColor',
        'hintTextColor',
        'headerIconColor',
      ] as const) {
        expect(light[key]).toBeDefined();
        expect(light[key]).not.toBe(dark[key]);
      }
    });

    it('maps the Android only search bar options', () => {
      expect(
        searchBarOptionsOf(
          settingsWith({
            inputType: 'phone',
            isShowHintSearchIcon: false,
            isDisableBackButtonOverride: true,
          }),
        ),
      ).toMatchObject({
        inputType: 'phone',
        shouldShowHintSearchIcon: false,
        disableBackButtonOverride: true,
      });
    });
  });

  describe('Negative', () => {
    it('falls back to the default for a value the panel could not have written', () => {
      expect(
        readHeaderOptionsSettings({
          isLargeTitle: 'yes',
          leftItems: 'ten buttons',
          placement: 'floating',
          colorTheme: 3,
        }),
      ).toEqual(DEFAULT_HEADER_OPTIONS_SETTINGS);
    });
  });
});
