import { describe, expect, it } from 'vitest';
import {
  NAVIGATION_RECIPES,
  platformLabel,
  recipeById,
} from './navigation-recipes';
import { ROUTE_LINE_INFO } from './navigation-lines';
import { ROUTE_NAME } from './routes';

describe('navigation recipes', () => {
  describe('Positive', () => {
    it('gives every recipe its own id', () => {
      const ids = NAVIGATION_RECIPES.map(recipe => recipe.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('attaches every recipe to a screen the hub lists', () => {
      const stops = Object.keys(ROUTE_LINE_INFO);
      for (const recipe of NAVIGATION_RECIPES) {
        expect(stops).toContain(recipe.route);
      }
    });

    it('states the question, the option and the visible effect of every recipe', () => {
      for (const recipe of NAVIGATION_RECIPES) {
        expect(recipe.question.trim()).not.toBe('');
        expect(recipe.option.trim()).not.toBe('');
        expect(recipe.expected.trim()).not.toBe('');
      }
    });

    it('finds a recipe by its id', () => {
      const first = NAVIGATION_RECIPES[0];
      expect(recipeById(first.id)).toBe(first);
    });

    it('says iOS 26 only for the tab bar options that older iOS ignores', () => {
      expect(recipeById('native-tabs-minimize').platform).toBe('ios26');
      expect(recipeById('native-tabs-accessory').platform).toBe('ios26');
    });

    it('says which iOS version the glass and priority header options need', () => {
      expect(recipeById('header-views-glass').platform).toBe('ios26');
      expect(recipeById('header-views-priority').platform).toBe('ios27');
    });

    it('marks the swipe options iOS only and the hardware back one Android only', () => {
      expect(recipeById('gestures-enabled').platform).toBe('ios');
      expect(recipeById('gestures-prevent').platform).toBe('ios');
      expect(recipeById('gestures-android-back').platform).toBe('android');
    });

    it('admits on screen that no stack sends beforeRemove yet', () => {
      expect(recipeById('events-before-remove').caveat).toContain('not sent');
    });

    it('marks the full window overlay iOS only', () => {
      expect(recipeById('overlays-toast').platform).toBe('ios');
      expect(recipeById('overlays-voiceover').platform).toBe('ios');
    });

    it('asks the header height of iOS and Android alike, they both report it', () => {
      expect(recipeById('transition-header-height').platform).toBe('all');
      expect(recipeById('transition-progress-hook').platform).toBe('all');
    });

    it('marks home indicator, scroll edge and Android only options for their platform', () => {
      expect(recipeById('insets-home-indicator').platform).toBe('ios');
      expect(recipeById('insets-scroll-edge').platform).toBe('ios26');
      expect(recipeById('insets-safe-area-edges').platform).toBe('ios26');
      expect(recipeById('insets-navigation-bar').platform).toBe('android');
      expect(recipeById('insets-disable-inset').platform).toBe('android');
    });

    it('offers the animation to both platforms and the duration to iOS only', () => {
      expect(recipeById('stack-animation').platform).toBe('all');
      expect(recipeById('stack-duration').platform).toBe('ios');
    });

    it('lists the global switches for both platforms and the inset flag for Android', () => {
      expect(recipeById('runtime-feature-flags').platform).toBe('all');
      expect(recipeById('runtime-enable-screens').platform).toBe('all');
      expect(recipeById('runtime-legacy-inset').platform).toBe('android');
    });

    it('marks bar buttons iOS only, the integrated search placement iOS 26 and the input type Android only', () => {
      expect(recipeById('header-options-bar-items').platform).toBe('ios');
      expect(recipeById('header-options-placement').platform).toBe('ios26');
      expect(recipeById('header-options-android').platform).toBe('android');
      expect(recipeById('header-options-search-events').platform).toBe('all');
    });

    it('marks the grabber iOS only and the sheet footer Android only', () => {
      expect(recipeById('sheet-grabber').platform).toBe('ios');
      expect(recipeById('sheet-footer').platform).toBe('android');
      expect(recipeById('sheet-detents').platform).toBe('all');
    });

    it('gives the structure screens their recipes, the tab state reset among them', () => {
      for (const route of [
        ROUTE_NAME.TabsDemo,
        ROUTE_NAME.DrawerDemo,
        ROUTE_NAME.NestedNavigators,
        ROUTE_NAME.DeepLinking,
        ROUTE_NAME.StatePersistence,
      ]) {
        const recipes = NAVIGATION_RECIPES.filter(
          recipe => recipe.route === route,
        );
        expect(recipes.length).toBeGreaterThanOrEqual(3);
      }
      expect(recipeById('tabs-state-reset').expected).toContain('0 again');
      expect(recipeById('drawer-overlay').caveat).toContain('back');
    });

    it('says on screen that the removed Android colours do nothing', () => {
      expect(recipeById('insets-removed-colors').expected).toContain(
        'changes nothing',
      );
    });

    it('names where each recipe can be tried', () => {
      expect(platformLabel('all')).toBe('iOS and Android');
      expect(platformLabel('ios')).toBe('iOS only');
      expect(platformLabel('android')).toBe('Android only');
      expect(platformLabel('ios26')).toBe('iOS 26 and later');
      expect(platformLabel('ios27')).toBe('iOS 27 and later');
    });
  });

  describe('Negative', () => {
    it('throws for an id no recipe has, so a typo in a screen fails loudly', () => {
      expect(() => recipeById('no-such-recipe')).toThrow(
        'no navigation recipe with id "no-such-recipe"',
      );
    });
  });
});
