// Route options folded into the `RNSScreen` prop names of the screens 4.30.0 codegen spec

import { describe, expect, it, vi } from 'vitest';
import { createElement } from '@symbiote-native/engine';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import { resolveScreenRenderPlan } from './render-stack';
import type { INavigatorPlatform, IScreenOptions } from './navigator-props';
import { featureFlags } from './screens-config';

const eventTarget = createElement('RCTView');
const IOS_PLATFORM_INPUT: INavigatorPlatform = {
  defaultHeaderBackTitleVisible: true,
  headerBarButtonsAvailable: true,
  isIOS26OrHigher: false,
};

function fireNativeEvent(
  props: Record<string, unknown>,
  eventName: string,
  nativeEvent: Record<string, unknown>,
): void {
  const handler = props[eventName];
  if (typeof handler !== 'function') {
    throw new Error(`no ${eventName} handler on the screen props`);
  }
  const event: ISymbioteEvent = {
    type: eventName,
    target: eventTarget,
    currentTarget: eventTarget,
    nativeEvent,
    stopPropagation: () => {},
  };
  handler(event);
}

function screenPropsOf(options: IScreenOptions): Record<string, unknown> {
  return resolveScreenRenderPlan({
    screenId: 'a',
    index: 0,
    routeCount: 1,
    options,
    platform: IOS_PLATFORM_INPUT,
    isAndroid: false,
    screenPassthrough: {},
  }).screenProps;
}

describe('sheet detent props', () => {
  it('sends the initial detent under the native name without an Index suffix', () => {
    const props = screenPropsOf({
      sheetAllowedDetents: [0.5, 1],
      sheetInitialDetentIndex: 1,
    });

    expect(props.sheetInitialDetent).toBe(1);
    expect(props).not.toHaveProperty('sheetInitialDetentIndex');
  });

  it('sends the largest undimmed detent under the native name without an Index suffix', () => {
    const props = screenPropsOf({
      sheetAllowedDetents: 'all',
      sheetLargestUndimmedDetentIndex: 'medium',
    });

    expect(props.sheetLargestUndimmedDetent).toBe(0);
    expect(props).not.toHaveProperty('sheetLargestUndimmedDetentIndex');
  });
});

describe('screen props that map one to one onto the native view', () => {
  const direct: [keyof IScreenOptions, unknown][] = [
    ['customAnimationOnSwipe', true],
    ['fullScreenSwipeShadowEnabled', false],
    ['homeIndicatorHidden', true],
    ['preventNativeDismiss', true],
    ['statusBarColor', '#ff0000'],
    ['statusBarTranslucent', true],
    ['swipeDirection', 'vertical'],
    ['replaceAnimation', 'push'],
    ['hideKeyboardOnSwipe', true],
    ['navigationBarColor', '#00ff00'],
    ['navigationBarTranslucent', true],
    ['navigationBarHidden', true],
    ['nativeBackButtonDismissalEnabled', true],
    ['androidResetScreenShadowStateOnOrientationChangeEnabled', false],
    ['iosOrientationInheritanceFixEnabled', false],
  ];

  it.each(direct)('forwards %s unchanged', (name, value) => {
    expect(screenPropsOf({ [name]: value })[name]).toBe(value);
  });
});

describe('global feature flags as screen defaults', () => {
  const flagged = [
    'androidResetScreenShadowStateOnOrientationChangeEnabled',
    'iosOrientationInheritanceFixEnabled',
  ] as const;

  it.each(flagged)(
    'sends the flag value for %s when the screen sets none',
    name => {
      expect(screenPropsOf({})[name]).toBe(true);
    },
  );

  it.each(flagged)('follows the app changing the %s flag', name => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    featureFlags.experiment[name] = false;
    try {
      expect(screenPropsOf({})[name]).toBe(false);
      expect(screenPropsOf({ [name]: true })[name]).toBe(true);
    } finally {
      featureFlags.experiment[name] = true;
      vi.restoreAllMocks();
    }
  });
});

describe('synchronous shadow state updates', () => {
  function planOf(options: IScreenOptions) {
    return resolveScreenRenderPlan({
      screenId: 'a',
      index: 0,
      routeCount: 1,
      options,
      platform: IOS_PLATFORM_INPUT,
      isAndroid: false,
      screenPassthrough: {},
    });
  }

  it('lets a sheet expand on scrolling to its edge unless the app opts out', () => {
    expect(
      planOf({ stackPresentation: 'formSheet' }).screenProps
        .sheetExpandsWhenScrolledToEdge,
    ).toBe(true);
    expect(
      planOf({ sheetExpandsWhenScrolledToEdge: false }).screenProps
        .sheetExpandsWhenScrolledToEdge,
    ).toBe(false);
  });

  it('pushes the screen size at once for every presentation', () => {
    expect(
      planOf({ stackPresentation: 'formSheet' }).screenProps
        .synchronousShadowStateUpdatesEnabled,
    ).toBe(true);
    expect(planOf({}).screenProps.synchronousShadowStateUpdatesEnabled).toBe(
      true,
    );
  });

  it('drops the push for every presentation when the app turns the screen flag off', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    featureFlags.experiment.synchronousScreenUpdatesEnabled = false;
    try {
      expect(
        planOf({ stackPresentation: 'formSheet' }).screenProps
          .synchronousShadowStateUpdatesEnabled,
      ).toBe(false);
      expect(planOf({}).screenProps.synchronousShadowStateUpdatesEnabled).toBe(
        false,
      );
    } finally {
      featureFlags.experiment.synchronousScreenUpdatesEnabled = true;
      vi.restoreAllMocks();
    }
  });

  it('sends the header config flag, on by default and off when the app says so', () => {
    expect(
      planOf({}).headerConfig.props.synchronousShadowStateUpdatesEnabled,
    ).toBe(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    featureFlags.experiment.synchronousHeaderConfigUpdatesEnabled = false;
    try {
      expect(
        planOf({}).headerConfig.props.synchronousShadowStateUpdatesEnabled,
      ).toBe(false);
    } finally {
      featureFlags.experiment.synchronousHeaderConfigUpdatesEnabled = true;
      vi.restoreAllMocks();
    }
  });
});

describe('full screen swipe', () => {
  it.each([
    [true, 'true'],
    [false, 'false'],
    [undefined, 'undefined'],
  ])('encodes %s as the native optional boolean %s', (enabled, encoded) => {
    expect(
      screenPropsOf({ fullScreenSwipeEnabled: enabled }).fullScreenSwipeEnabled,
    ).toBe(encoded);
  });
});

describe('gesture response distance', () => {
  it('fills the edges the app left out with -1, the value native reads as unlimited', () => {
    expect(
      screenPropsOf({ gestureResponseDistance: { start: 40 } })
        .gestureResponseDistance,
    ).toEqual({ start: 40, end: -1, top: -1, bottom: -1 });
  });

  it('sends all four edges as -1 when the app sets none', () => {
    expect(screenPropsOf({}).gestureResponseDistance).toEqual({
      start: -1,
      end: -1,
      top: -1,
      bottom: -1,
    });
  });
});

describe('scroll edge effects', () => {
  it('splits the one scrollEdgeEffects object into the four native props', () => {
    const props = screenPropsOf({
      scrollEdgeEffects: {
        top: 'hard',
        bottom: 'soft',
        left: 'hidden',
        right: 'automatic',
      },
    });

    expect(props.topScrollEdgeEffect).toBe('hard');
    expect(props.bottomScrollEdgeEffect).toBe('soft');
    expect(props.leftScrollEdgeEffect).toBe('hidden');
    expect(props.rightScrollEdgeEffect).toBe('automatic');
  });

  it('leaves the native default in place when an edge is not given', () => {
    const props = screenPropsOf({ scrollEdgeEffects: { top: 'hard' } });

    expect(props.topScrollEdgeEffect).toBe('hard');
    expect(props.bottomScrollEdgeEffect).toBeUndefined();
  });
});

describe('screen events', () => {
  it('hands the native payload of onNativeDismissCancelled to the option callback', () => {
    const onNativeDismissCancelled = vi.fn();
    const props = screenPropsOf({ onNativeDismissCancelled });

    fireNativeEvent(props, 'onNativeDismissCancelled', { dismissCount: 2 });

    expect(onNativeDismissCancelled).toHaveBeenCalledWith({ dismissCount: 2 });
  });

  it('hands the native payload of onHeaderHeightChange to the option callback', () => {
    const onHeaderHeightChange = vi.fn();
    const props = screenPropsOf({ onHeaderHeightChange });

    fireNativeEvent(props, 'onHeaderHeightChange', { headerHeight: 96 });

    expect(onHeaderHeightChange).toHaveBeenCalledWith({ headerHeight: 96 });
  });

  it('hands the native payload of onTransitionProgress to the option callback', () => {
    const onTransitionProgress = vi.fn();
    const props = screenPropsOf({ onTransitionProgress });
    const payload = { progress: 0.5, closing: 0, goingForward: 1 };

    fireNativeEvent(props, 'onTransitionProgress', payload);

    expect(onTransitionProgress).toHaveBeenCalledWith(payload);
  });

  it('calls onGestureCancel without a payload', () => {
    const onGestureCancel = vi.fn();
    const props = screenPropsOf({ onGestureCancel });

    fireNativeEvent(props, 'onGestureCancel', {});

    expect(onGestureCancel).toHaveBeenCalledTimes(1);
  });

  it('hands the native payload of onSheetDetentChanged to the option callback', () => {
    const onSheetDetentChanged = vi.fn();
    const props = screenPropsOf({ onSheetDetentChanged });

    fireNativeEvent(props, 'onSheetDetentChanged', {
      index: 1,
      isStable: true,
    });

    expect(onSheetDetentChanged).toHaveBeenCalledWith({
      index: 1,
      isStable: true,
    });
  });

  it('leaves the native listener out when the app sets no callback', () => {
    const props = screenPropsOf({});

    expect(props).not.toHaveProperty('onNativeDismissCancelled');
    expect(props).not.toHaveProperty('onHeaderHeightChange');
    expect(props).not.toHaveProperty('onTransitionProgress');
    expect(props).not.toHaveProperty('onGestureCancel');
    expect(props).not.toHaveProperty('onSheetDetentChanged');
  });
});

describe('header in a modal', () => {
  function planOf(options: IScreenOptions) {
    return resolveScreenRenderPlan({
      screenId: 'a',
      index: 0,
      routeCount: 1,
      options,
      platform: IOS_PLATFORM_INPUT,
      isAndroid: false,
      screenPassthrough: {},
    });
  }

  const edgeAndHeight: IScreenOptions = {
    scrollEdgeEffects: { top: 'hard' },
    onHeaderHeightChange: vi.fn(),
  };

  it('moves scroll edge effects to the inner screen, where the scroll view lives', () => {
    const plan = planOf({ ...edgeAndHeight, stackPresentation: 'modal' });

    expect(plan.inModal).toBe(true);
    expect(plan.screenProps.topScrollEdgeEffect).toBeUndefined();
    expect(plan.innerScreenProps.topScrollEdgeEffect).toBe('hard');
  });

  it('moves onHeaderHeightChange to the inner screen, which owns the header', () => {
    const onHeaderHeightChange = vi.fn();
    const plan = planOf({ onHeaderHeightChange, stackPresentation: 'modal' });

    expect(plan.screenProps).not.toHaveProperty('onHeaderHeightChange');
    fireNativeEvent(plan.innerScreenProps, 'onHeaderHeightChange', {
      headerHeight: 64,
    });
    expect(onHeaderHeightChange).toHaveBeenCalledWith({ headerHeight: 64 });
  });

  it('keeps both on the outer screen when the header is not in a modal', () => {
    const plan = planOf({ ...edgeAndHeight, stackPresentation: 'push' });

    expect(plan.inModal).toBe(false);
    expect(plan.screenProps.topScrollEdgeEffect).toBe('hard');
    expect(plan.screenProps.onHeaderHeightChange).toBeTypeOf('function');
  });

  it('still gives the inner screen its fill style and activity state', () => {
    const plan = planOf({ stackPresentation: 'modal' });

    expect(plan.innerScreenProps.style).toEqual({
      position: 'absolute',
      top: 0,
      start: 0,
      end: 0,
      bottom: 0,
    });
    expect(plan.innerScreenProps.activityState).toBe(plan.activityState);
  });
});
