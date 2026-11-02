// Route options folded into the `RNSScreenStackHeaderConfig` prop names of the screens 4.30.0 spec

import { describe, expect, it, vi } from 'vitest';
import { createElement } from '@symbiote-native/engine';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import { resolveScreenRenderPlan } from './render-stack';
import type { INavigatorPlatform, IScreenOptions } from './navigator-props';

const IOS_PLATFORM_INPUT: INavigatorPlatform = {
  defaultHeaderBackTitleVisible: true,
  headerBarButtonsAvailable: true,
  isIOS26OrHigher: false,
};

function headerPropsOf(options: IScreenOptions): Record<string, unknown> {
  return resolveScreenRenderPlan({
    screenId: 'a',
    index: 0,
    routeCount: 1,
    options,
    platform: IOS_PLATFORM_INPUT,
    isAndroid: false,
    screenPassthrough: {},
  }).headerConfig.props;
}

describe('header text styles', () => {
  it('splits headerTitleStyle into the three native title font props', () => {
    const props = headerPropsOf({
      headerTitleStyle: {
        fontFamily: 'Menlo',
        fontSize: 18,
        fontWeight: '700',
      },
    });

    expect(props.titleFontFamily).toBe('Menlo');
    expect(props.titleFontSize).toBe(18);
    expect(props.titleFontWeight).toBe('700');
  });

  it('splits headerBackTitleStyle into the two native back title font props', () => {
    const props = headerPropsOf({
      headerBackTitleStyle: { fontFamily: 'Menlo', fontSize: 14 },
    });

    expect(props.backTitleFontFamily).toBe('Menlo');
    expect(props.backTitleFontSize).toBe(14);
  });

  it('splits headerLargeTitleStyle into the four native large title props', () => {
    const props = headerPropsOf({
      headerLargeTitleStyle: {
        fontFamily: 'Menlo',
        fontSize: 34,
        fontWeight: '800',
        color: '#ff0000',
      },
    });

    expect(props.largeTitleFontFamily).toBe('Menlo');
    expect(props.largeTitleFontSize).toBe(34);
    expect(props.largeTitleFontWeight).toBe('800');
    expect(props.largeTitleColor).toBe('#ff0000');
  });

  it('leaves the native font props out when no style is given', () => {
    const props = headerPropsOf({});

    expect(props.titleFontFamily).toBeUndefined();
    expect(props.backTitleFontSize).toBeUndefined();
    expect(props.largeTitleColor).toBeUndefined();
  });
});

describe('header flags the native side reads inverted', () => {
  const inverted: [keyof IScreenOptions, string][] = [
    ['headerShadowVisible', 'hideShadow'],
    ['headerLargeTitleShadowVisible', 'largeTitleHideShadow'],
    ['headerBackVisible', 'hideBackButton'],
    ['headerBackButtonMenuEnabled', 'disableBackButtonMenu'],
  ];

  it.each(inverted)('turns %s true into %s false', (option, native) => {
    expect(headerPropsOf({ [option]: true })[native]).toBe(false);
  });

  it.each(inverted)('turns %s false into %s true', (option, native) => {
    expect(headerPropsOf({ [option]: false })[native]).toBe(true);
  });

  it.each(inverted)('keeps %s unset as an unset %s', (_option, native) => {
    expect(headerPropsOf({})[native]).toBeUndefined();
  });
});

describe('header props that map one to one onto the native view', () => {
  const direct: [keyof IScreenOptions, string, unknown][] = [
    ['headerBlurEffect', 'blurEffect', 'systemMaterial'],
    ['headerBackButtonInCustomView', 'backButtonInCustomView', true],
    ['headerTopInsetEnabled', 'topInsetEnabled', false],
    ['headerLegacyTopInsetBehavior', 'legacyTopInsetBehavior', true],
  ];

  it.each(direct)('forwards %s as %s', (option, native, value) => {
    expect(headerPropsOf({ [option]: value })[native]).toBe(value);
  });
});

describe('header attach events', () => {
  const eventTarget = createElement('RCTView');
  const attachEvent: ISymbioteEvent = {
    type: 'test',
    target: eventTarget,
    currentTarget: eventTarget,
    nativeEvent: {},
    stopPropagation: () => {},
  };

  it.each([
    ['onHeaderAttached', 'onAttached'],
    ['onHeaderDetached', 'onDetached'],
  ] as const)('calls %s when native fires %s', (option, native) => {
    const callback = vi.fn();
    const handler = headerPropsOf({ [option]: callback })[native];

    expect(handler).toBeTypeOf('function');
    if (typeof handler === 'function') handler(attachEvent);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('registers no native listener when the app sets no callback', () => {
    const props = headerPropsOf({});

    expect(props).not.toHaveProperty('onAttached');
    expect(props).not.toHaveProperty('onDetached');
  });
});

describe('header direction', () => {
  it.each(['rtl', 'ltr'] as const)(
    'sends headerDirection %s as the native direction',
    value => {
      expect(headerPropsOf({ headerDirection: value }).direction).toBe(value);
    },
  );

  it('leaves the native ltr default in place when the app sets no direction', () => {
    expect(headerPropsOf({}).direction).toBeUndefined();
  });
});

describe('header config container', () => {
  function headerOn(isAndroid: boolean): Record<string, unknown> {
    return resolveScreenRenderPlan({
      screenId: 'a',
      index: 0,
      routeCount: 1,
      options: {},
      platform: IOS_PLATFORM_INPUT,
      isAndroid,
      screenPassthrough: {},
    }).headerConfig.props;
  }

  it('lays the subviews out in a full-width row without taking space from the content', () => {
    expect(headerOn(false).style).toEqual({
      position: 'absolute',
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    });
  });

  it('centers the subviews on iOS only', () => {
    expect(headerOn(true).style).toEqual({
      position: 'absolute',
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
    });
  });

  it('lets touches reach the content below the header', () => {
    expect(headerOn(false).pointerEvents).toBe('box-none');
  });
});

describe('header search bar subview', () => {
  it('hosts the search bar in a searchBar subview with the centered row style', () => {
    const plan = resolveScreenRenderPlan({
      screenId: 'a',
      index: 0,
      routeCount: 1,
      options: { headerSearchBarOptions: {} },
      platform: IOS_PLATFORM_INPUT,
      isAndroid: false,
      screenPassthrough: {},
    });

    expect(plan.headerConfig.children[0]?.props).toEqual({
      type: 'searchBar',
      style: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      },
      synchronousShadowStateUpdatesEnabled: true,
    });
  });
});

describe('header bar buttons on a platform without them', () => {
  function headerOn(headerBarButtonsAvailable: boolean) {
    return resolveScreenRenderPlan({
      screenId: 'a',
      index: 0,
      routeCount: 1,
      options: {
        headerRightBarButtonItems: [
          { type: 'button', title: 'Save', onPress: () => {} },
        ],
      },
      platform: {
        defaultHeaderBackTitleVisible: true,
        headerBarButtonsAvailable,
        isIOS26OrHigher: false,
      },
      isAndroid: !headerBarButtonsAvailable,
      screenPassthrough: {},
    }).headerConfig.props;
  }

  it('sends the items and their press handler where the platform has bar buttons', () => {
    const props = headerOn(true);

    expect(props.headerRightBarButtonItems).toHaveLength(1);
    expect(props.onPressHeaderBarButtonItem).toBeTypeOf('function');
  });

  it('sends neither the items nor a press handler where it has none', () => {
    const props = headerOn(false);

    expect(props.headerRightBarButtonItems).toBeUndefined();
    expect(props.onPressHeaderBarButtonItem).toBeUndefined();
  });
});

describe('header bar button item visibility priority', () => {
  it('sends visibilityPriority of a bar button item down to native untouched', () => {
    const props = headerPropsOf({
      headerRightBarButtonItems: [
        {
          type: 'button',
          title: 'Save',
          onPress: () => {},
          visibilityPriority: 'high',
        },
      ],
    });

    expect(props.headerRightBarButtonItems).toMatchObject([
      { title: 'Save', visibilityPriority: 'high' },
    ]);
  });
});
