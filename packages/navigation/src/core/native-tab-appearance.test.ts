import { describe, expect, it } from 'vitest';
import { processColor } from '@symbiote-native/engine';
import {
  resolveTabAppearanceAndroid,
  resolveTabAppearanceIOS,
} from './native-tab-appearance';

const RED = processColor('red');

describe('tab appearance on iOS', () => {
  it('sends nothing when the app sets no appearance', () => {
    expect(resolveTabAppearanceIOS(undefined)).toBeUndefined();
  });

  it('turns the bar colors into the processed values native reads', () => {
    const appearance = resolveTabAppearanceIOS({
      tabBarBackgroundColor: 'red',
      tabBarShadowColor: 'red',
    });

    expect(appearance?.tabBarBackgroundColor).toBe(RED);
    expect(appearance?.tabBarShadowColor).toBe(RED);
  });

  it('passes the blur effect through', () => {
    expect(
      resolveTabAppearanceIOS({ tabBarBlurEffect: 'systemMaterial' })
        ?.tabBarBlurEffect,
    ).toBe('systemMaterial');
  });

  it('processes the colors of every item layout and state', () => {
    const appearance = resolveTabAppearanceIOS({
      stacked: { normal: { tabBarItemTitleFontColor: 'red' } },
      inline: { selected: { tabBarItemIconColor: 'red' } },
      compactInline: { disabled: { tabBarItemBadgeBackgroundColor: 'red' } },
    });

    expect(appearance).toMatchObject({
      stacked: { normal: { tabBarItemTitleFontColor: RED } },
      inline: { selected: { tabBarItemIconColor: RED } },
      compactInline: { disabled: { tabBarItemBadgeBackgroundColor: RED } },
    });
  });

  it('sends a numeric font weight as a string', () => {
    const appearance = resolveTabAppearanceIOS({
      stacked: { normal: { tabBarItemTitleFontWeight: 700 } },
    });

    expect(appearance).toMatchObject({
      stacked: { normal: { tabBarItemTitleFontWeight: '700' } },
    });
  });

  it('keeps a named font weight and the other font fields', () => {
    const appearance = resolveTabAppearanceIOS({
      stacked: {
        focused: {
          tabBarItemTitleFontWeight: 'bold',
          tabBarItemTitleFontFamily: 'Menlo',
          tabBarItemTitleFontSize: 12,
          tabBarItemTitlePositionAdjustment: { horizontal: 1, vertical: 2 },
        },
      },
    });

    expect(appearance).toMatchObject({
      stacked: {
        focused: {
          tabBarItemTitleFontWeight: 'bold',
          tabBarItemTitleFontFamily: 'Menlo',
          tabBarItemTitleFontSize: 12,
          tabBarItemTitlePositionAdjustment: { horizontal: 1, vertical: 2 },
        },
      },
    });
  });

  it('leaves a state the app did not set undefined', () => {
    const appearance = resolveTabAppearanceIOS({ stacked: { normal: {} } });

    expect(appearance?.stacked).not.toHaveProperty('selected', RED);
    expect(appearance?.stacked).toMatchObject({ selected: undefined });
    expect(appearance?.inline).toBeUndefined();
  });
});

describe('tab appearance on Android', () => {
  it('sends nothing when the app sets no appearance', () => {
    expect(resolveTabAppearanceAndroid(undefined)).toBeUndefined();
  });

  it('processes the bar, ripple, indicator and badge colors', () => {
    const appearance = resolveTabAppearanceAndroid({
      tabBarBackgroundColor: 'red',
      tabBarItemRippleColor: 'red',
      tabBarItemActiveIndicatorColor: 'red',
      tabBarItemBadgeBackgroundColor: 'red',
      tabBarItemBadgeTextColor: 'red',
    });

    expect(appearance).toMatchObject({
      tabBarBackgroundColor: RED,
      tabBarItemRippleColor: RED,
      tabBarItemActiveIndicatorColor: RED,
      tabBarItemBadgeBackgroundColor: RED,
      tabBarItemBadgeTextColor: RED,
    });
  });

  it('processes the colors of every item state', () => {
    const appearance = resolveTabAppearanceAndroid({
      normal: { tabBarItemTitleFontColor: 'red' },
      selected: { tabBarItemIconColor: 'red' },
      focused: { tabBarItemTitleFontColor: 'red', tabBarItemIconColor: 'red' },
      disabled: { tabBarItemIconColor: 'red' },
    });

    expect(appearance?.normal?.tabBarItemTitleFontColor).toBe(RED);
    expect(appearance?.selected?.tabBarItemIconColor).toBe(RED);
    expect(appearance?.focused).toEqual({
      tabBarItemTitleFontColor: RED,
      tabBarItemIconColor: RED,
    });
    expect(appearance?.disabled?.tabBarItemIconColor).toBe(RED);
  });

  it('sends a numeric font weight as a string', () => {
    expect(
      resolveTabAppearanceAndroid({ tabBarItemTitleFontWeight: 500 })
        ?.tabBarItemTitleFontWeight,
    ).toBe('500');
  });

  it('passes the layout and indicator fields through', () => {
    const fields = {
      tabBarItemLabelVisibilityMode: 'labeled',
      tabBarItemIconSize: 24,
      tabBarItemActiveIndicatorEnabled: false,
      tabBarItemActiveIndicatorWidth: 40,
      tabBarItemActiveIndicatorHeight: 20,
      tabBarItemTitleFontFamily: 'Roboto',
      tabBarItemTitleSmallLabelFontSize: 10,
      tabBarItemTitleLargeLabelFontSize: 14,
      tabBarItemTitleFontStyle: 'italic',
    } as const;

    expect(resolveTabAppearanceAndroid(fields)).toMatchObject(fields);
  });
});
