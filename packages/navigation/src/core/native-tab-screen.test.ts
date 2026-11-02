import { describe, expect, it, vi } from 'vitest';
import { processColor } from '@symbiote-native/engine';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import { resolveNativeTabScreen } from './native-tab-screen';

const RED = processColor('red');

const SCREEN_FILL = {
  position: 'absolute',
  flex: 1,
  width: '100%',
  height: '100%',
};

const NATIVE_EVENT: ISymbioteEvent = {
  type: 'lifecycle',
  target: 1,
  currentTarget: 1,
  nativeEvent: {},
  stopPropagation: () => {},
};

describe('native tab screen view', () => {
  it('uses the iOS screen view on iOS', () => {
    expect(resolveNativeTabScreen({ screenKey: 'a' }, 'ios').viewName).toBe(
      'RNSTabsScreenIOS',
    );
  });

  it('uses the Android screen view on Android', () => {
    expect(resolveNativeTabScreen({ screenKey: 'a' }, 'android').viewName).toBe(
      'RNSTabsScreenAndroid',
    );
  });

  it('falls back to a plain view where there are no native tabs', () => {
    const screen = resolveNativeTabScreen({ screenKey: 'a' }, 'web');

    expect(screen.viewName).toBe('view');
    expect(screen.props).not.toHaveProperty('screenKey');
  });
});

describe.each(['ios', 'android'])('native tab screen on %s', os => {
  it('fills the host without collapsing, so native keeps the view', () => {
    const { props } = resolveNativeTabScreen({ screenKey: 'a' }, os);

    expect(props.collapsable).toBe(false);
    expect(props.style).toContainEqual(SCREEN_FILL);
  });

  it('keeps the background the app asked for beside the fill', () => {
    const { props } = resolveNativeTabScreen(
      { screenKey: 'a', style: { backgroundColor: 'red' } },
      os,
    );

    expect(props.style).toContainEqual({ backgroundColor: 'red' });
    expect(props.style).toContainEqual(SCREEN_FILL);
  });

  it('sends the control, label and accessibility options as they are', () => {
    const { props } = resolveNativeTabScreen(
      {
        screenKey: 'home',
        preventNativeSelection: true,
        title: 'Home',
        badgeValue: '3',
        testID: 'screen',
        accessibilityLabel: 'Home screen',
        tabBarItemTestID: 'item',
        tabBarItemAccessibilityLabel: 'Home tab',
        specialEffects: {
          repeatedTabSelection: { popToRoot: false, scrollToTop: true },
        },
      },
      os,
    );

    expect(props).toMatchObject({
      screenKey: 'home',
      preventNativeSelection: true,
      title: 'Home',
      badgeValue: '3',
      testID: 'screen',
      accessibilityLabel: 'Home screen',
      tabBarItemTestID: 'item',
      tabBarItemAccessibilityLabel: 'Home tab',
      specialEffects: {
        repeatedTabSelection: { popToRoot: false, scrollToTop: true },
      },
    });
  });

  it('sends nothing for an option the app did not set', () => {
    const { props } = resolveNativeTabScreen({ screenKey: 'a' }, os);

    expect(props).not.toHaveProperty('title');
    expect(props).not.toHaveProperty('badgeValue');
    expect(props).not.toHaveProperty('preventNativeSelection');
    expect(props).not.toHaveProperty('standardAppearance');
    expect(props).not.toHaveProperty('onWillAppear');
  });

  it.each([
    'onWillAppear',
    'onDidAppear',
    'onWillDisappear',
    'onDidDisappear',
  ] as const)(
    'wires %s only when the app listens, and calls it without the event',
    name => {
      const callback = vi.fn();
      const { props } = resolveNativeTabScreen(
        { screenKey: 'a', [name]: callback },
        os,
      );
      const handler = props[name];

      expect(typeof handler).toBe('function');
      if (typeof handler === 'function') handler(NATIVE_EVENT);
      expect(callback).toHaveBeenCalledExactlyOnceWith();
    },
  );
});

describe('native tab screen on iOS', () => {
  it('tells native when the app gave no title, so it can use its own', () => {
    expect(
      resolveNativeTabScreen({ screenKey: 'a' }, 'ios').props.isTitleUndefined,
    ).toBe(true);
    expect(
      resolveNativeTabScreen({ screenKey: 'a', title: '' }, 'ios').props
        .isTitleUndefined,
    ).toBe(false);
  });

  it('sends the orientation', () => {
    expect(
      resolveNativeTabScreen(
        { screenKey: 'a', orientation: 'landscape' },
        'ios',
      ).props.orientation,
    ).toBe('landscape');
  });

  it('renames the role and the experimental interface style to the native names', () => {
    const { props } = resolveNativeTabScreen(
      {
        screenKey: 'a',
        ios: { role: 'search', experimental_userInterfaceStyle: 'dark' },
      },
      'ios',
    );

    expect(props).toMatchObject({
      tabRole: 'search',
      userInterfaceStyle: 'dark',
    });
    expect(props).not.toHaveProperty('role');
  });

  it('sends the system item, search activation and inset override', () => {
    const { props } = resolveNativeTabScreen(
      {
        screenKey: 'a',
        ios: {
          systemItem: 'favorites',
          automaticallyActivatesSearch: true,
          overrideScrollViewContentInsetAdjustmentBehavior: false,
        },
      },
      'ios',
    );

    expect(props).toMatchObject({
      systemItem: 'favorites',
      automaticallyActivatesSearch: true,
      overrideScrollViewContentInsetAdjustmentBehavior: false,
    });
  });

  it('turns the icon and the selected icon into the flat native keys', () => {
    const { props } = resolveNativeTabScreen(
      {
        screenKey: 'a',
        ios: {
          icon: { type: 'sfSymbol', name: 'house' },
          selectedIcon: { type: 'sfSymbol', name: 'house.fill' },
        },
      },
      'ios',
    );

    expect(props).toMatchObject({
      iconType: 'sfSymbol',
      iconResourceName: 'house',
      selectedIconResourceName: 'house.fill',
    });
  });

  it('throws on a selected icon without an icon, as native has one icon type', () => {
    expect(() =>
      resolveNativeTabScreen(
        {
          screenKey: 'a',
          ios: { selectedIcon: { type: 'sfSymbol', name: 'house.fill' } },
        },
        'ios',
      ),
    ).toThrow('the icon prop must also be provided');
  });

  it('processes the colors of the standard and the scroll edge appearance', () => {
    const { props } = resolveNativeTabScreen(
      {
        screenKey: 'a',
        ios: {
          standardAppearance: { tabBarBackgroundColor: 'red' },
          scrollEdgeAppearance: { tabBarShadowColor: 'red' },
        },
      },
      'ios',
    );

    expect(props).toMatchObject({
      standardAppearance: { tabBarBackgroundColor: RED },
      scrollEdgeAppearance: { tabBarShadowColor: RED },
    });
  });

  it('leaves the Android options and the Android icon keys out', () => {
    const { props } = resolveNativeTabScreen(
      {
        screenKey: 'a',
        android: {
          icon: { type: 'drawableResource', name: 'ic_home' },
          standardAppearance: { tabBarBackgroundColor: 'red' },
        },
      },
      'ios',
    );

    expect(props).not.toHaveProperty('drawableIconResourceName');
    expect(props).not.toHaveProperty('standardAppearance');
  });
});

describe('native tab screen on Android', () => {
  it('does not send the iOS only keys', () => {
    const { props } = resolveNativeTabScreen(
      {
        screenKey: 'a',
        orientation: 'landscape',
        ios: {
          role: 'search',
          systemItem: 'favorites',
          icon: { type: 'sfSymbol', name: 'house' },
          standardAppearance: { tabBarBackgroundColor: 'red' },
        },
      },
      'android',
    );

    expect(props).not.toHaveProperty('isTitleUndefined');
    expect(props).not.toHaveProperty('orientation');
    expect(props).not.toHaveProperty('tabRole');
    expect(props).not.toHaveProperty('systemItem');
    expect(props).not.toHaveProperty('iconType');
    expect(props).not.toHaveProperty('standardAppearance');
  });

  it('turns the drawable icons and their tinting into the Android keys', () => {
    const { props } = resolveNativeTabScreen(
      {
        screenKey: 'a',
        android: {
          icon: {
            type: 'drawableResource',
            name: 'ic_home',
            tinting: 'tinted',
          },
          selectedIcon: { type: 'drawableResource', name: 'ic_home_fill' },
        },
      },
      'android',
    );

    expect(props).toMatchObject({
      drawableIconResourceName: 'ic_home',
      iconTinting: 'tinted',
      selectedDrawableIconResourceName: 'ic_home_fill',
    });
  });

  it('processes the colors of the standard appearance', () => {
    const { props } = resolveNativeTabScreen(
      {
        screenKey: 'a',
        android: {
          standardAppearance: {
            tabBarItemRippleColor: 'red',
            selected: { tabBarItemIconColor: 'red' },
          },
        },
      },
      'android',
    );

    expect(props).toMatchObject({
      standardAppearance: {
        tabBarItemRippleColor: RED,
        selected: { tabBarItemIconColor: RED },
      },
    });
  });
});
