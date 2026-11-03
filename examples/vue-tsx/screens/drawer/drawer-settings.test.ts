import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRAWER_SETTINGS,
  drawerPropsOf,
  DRAWER_WIDTH,
} from './drawer-settings';
import type { IDrawerSettings } from './drawer-settings';

function drawerWith(patch: Partial<IDrawerSettings>): IDrawerSettings {
  return { ...DEFAULT_DRAWER_SETTINGS, ...patch };
}

describe('drawer settings', () => {
  describe('Positive', () => {
    it('opens from the left over the screen with swipe on, like the library default', () => {
      expect(drawerPropsOf(DEFAULT_DRAWER_SETTINGS)).toMatchObject({
        drawerType: 'front',
        drawerPosition: 'left',
        swipeEnabled: true,
      });
    });

    it('leaves width and overlay to the library until a choice is made', () => {
      const props = drawerPropsOf(DEFAULT_DRAWER_SETTINGS);
      expect(props.drawerWidth).toBeUndefined();
      expect(props.overlayColor).toBeUndefined();
    });

    it('passes every drawer type and the right edge through', () => {
      const props = drawerPropsOf(
        drawerWith({ drawerType: 'permanent', drawerPosition: 'right' }),
      );
      expect(props.drawerType).toBe('permanent');
      expect(props.drawerPosition).toBe('right');
    });

    it('makes the narrow drawer narrower and the wide one wider than the default', () => {
      const narrow = drawerPropsOf(drawerWith({ width: 'narrow' })).drawerWidth;
      const wide = drawerPropsOf(drawerWith({ width: 'wide' })).drawerWidth;
      expect(narrow).toBe(DRAWER_WIDTH.narrow);
      expect(wide).toBe(DRAWER_WIDTH.wide);
      expect(DRAWER_WIDTH.narrow).toBeLessThan(DRAWER_WIDTH.wide);
    });

    it('turns the overlay choice into a colour, clear being fully transparent', () => {
      expect(drawerPropsOf(drawerWith({ overlay: 'clear' })).overlayColor).toBe(
        'transparent',
      );
      expect(
        drawerPropsOf(drawerWith({ overlay: 'tint' })).overlayColor,
      ).toMatch(/^rgba\(/);
    });

    it('reads the swipe tuning choices as numbers', () => {
      const props = drawerPropsOf(
        drawerWith({ edge: '160', distance: '20', velocity: '2' }),
      );
      expect(props.swipeEdgeWidth).toBe(160);
      expect(props.swipeMinDistance).toBe(20);
      expect(props.swipeMinVelocity).toBe(2);
    });

    it('turns swipe off', () => {
      expect(
        drawerPropsOf(drawerWith({ isSwipeEnabled: false })).swipeEnabled,
      ).toBe(false);
    });
  });
});
