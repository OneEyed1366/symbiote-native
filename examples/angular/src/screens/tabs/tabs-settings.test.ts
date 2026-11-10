import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TABS_SETTINGS,
  TAB_NAMES,
  tabBarOptionsOf,
  tabOptionsOf,
} from './tabs-settings';
import type { ITabsSettings } from './tabs-settings';

function tabsWith(patch: Partial<ITabsSettings>): ITabsSettings {
  return { ...DEFAULT_TABS_SETTINGS, ...patch };
}

describe('tab settings', () => {
  describe('Positive', () => {
    it('labels every tab by its own name and gives it a glyph by default', () => {
      for (const name of TAB_NAMES) {
        const options = tabOptionsOf(DEFAULT_TABS_SETTINGS, name);
        expect(options.tabBarLabel).toBe(name);
        expect(options.tabBarIcon).toBeDefined();
        expect(options.tabBarBadge).toBeUndefined();
      }
    });

    it('leaves the tab without an icon when icons are off', () => {
      expect(
        tabOptionsOf(tabsWith({ icon: 'none' }), 'Home').tabBarIcon,
      ).toBeUndefined();
    });

    it('names the tab by title when no label is set, and by route name when neither is', () => {
      const byTitle = tabOptionsOf(tabsWith({ label: 'title' }), 'Search');
      expect(byTitle.tabBarLabel).toBeUndefined();
      expect(byTitle.title).toBe('Search title');
      const byRoute = tabOptionsOf(tabsWith({ label: 'routeName' }), 'Search');
      expect(byRoute.tabBarLabel).toBeUndefined();
      expect(byRoute.title).toBeUndefined();
    });

    it('opens on Home with the counter above the tabs at 0', () => {
      expect(DEFAULT_TABS_SETTINGS.initial).toBe('Home');
      expect(DEFAULT_TABS_SETTINGS.liftedCount).toBe(0);
    });

    it('gives each tab its own glyph when icons are on', () => {
      const glyphs = TAB_NAMES.map(
        name => tabOptionsOf(tabsWith({ icon: 'glyph' }), name).tabBarIcon,
      );
      expect(new Set(glyphs).size).toBe(TAB_NAMES.length);
    });

    it('puts the badge on the Search tab only', () => {
      const settings = tabsWith({ badge: 'number' });
      expect(tabOptionsOf(settings, 'Search').tabBarBadge).toBe(3);
      expect(tabOptionsOf(settings, 'Home').tabBarBadge).toBeUndefined();
      expect(tabOptionsOf(settings, 'Profile').tabBarBadge).toBeUndefined();
    });

    it('shows a text badge as text', () => {
      expect(
        tabOptionsOf(tabsWith({ badge: 'text' }), 'Search').tabBarBadge,
      ).toBe('new');
    });

    it('leaves the bar to the library by default', () => {
      expect(tabBarOptionsOf(DEFAULT_TABS_SETTINGS)).toEqual({});
    });

    it('tints the active and the inactive tab and paints the bar for all tabs', () => {
      const options = tabBarOptionsOf(
        tabsWith({ activeTint: 'red', inactiveTint: 'light', bar: 'dark' }),
      );
      expect(options.tabBarActiveTintColor).toBeDefined();
      expect(options.tabBarInactiveTintColor).toBeDefined();
      expect(options.tabBarStyle).toBeDefined();
    });
  });
});
