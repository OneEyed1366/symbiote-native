import type { IScreenOptions } from '@symbiote-native/navigation/angular';
import {
  isParamsRecord,
  readChoice,
  readCount,
  readFlag,
} from '../read-params';

type ISwipeDirection = NonNullable<IScreenOptions['swipeDirection']>;

export const SWIPE_DIRECTIONS = [
  'horizontal',
  'vertical',
] as const satisfies readonly ISwipeDirection[];

// `whole` leaves the swipe free, the others cut a rectangle of the window out for it
export const SWIPE_AREAS = ['whole', 'bottomHalf', 'centerColumn'] as const;

type ISwipeArea = (typeof SWIPE_AREAS)[number];

type IWindowSize = { width: number; height: number };

// The whole panel state, written to the route params and read back by the options resolver
export type IGesturesSettings = {
  isModal: boolean;
  isGestureEnabled: boolean;
  isFullScreenSwipe: boolean;
  isFullScreenShadow: boolean;
  isCustomAnimation: boolean;
  swipeDirection: ISwipeDirection;
  area: ISwipeArea;
  isKeyboardHidden: boolean;
  isDismissPrevented: boolean;
  isNativeBackDismissal: boolean;
  // How often native stopped a dismissal, from `onNativeDismissCancelled`
  dismissAttempts: number;
  // How often a swipe back was let go before it finished, from `onGestureCancel`
  gestureCancels: number;
};

export const DEFAULT_GESTURES_SETTINGS: IGesturesSettings = {
  isModal: false,
  isGestureEnabled: true,
  isFullScreenSwipe: false,
  isFullScreenShadow: true,
  isCustomAnimation: false,
  swipeDirection: 'horizontal',
  area: 'whole',
  isKeyboardHidden: false,
  isDismissPrevented: false,
  isNativeBackDismissal: false,
  dismissAttempts: 0,
  gestureCancels: 0,
};

const CENTER_COLUMN_START = 0.25;
const CENTER_COLUMN_END = 0.75;

export function readGesturesSettings(params: unknown): IGesturesSettings {
  const base = DEFAULT_GESTURES_SETTINGS;
  if (!isParamsRecord(params)) return base;
  return {
    isModal: readFlag(params, 'isModal', base.isModal),
    isGestureEnabled: readFlag(
      params,
      'isGestureEnabled',
      base.isGestureEnabled,
    ),
    isFullScreenSwipe: readFlag(
      params,
      'isFullScreenSwipe',
      base.isFullScreenSwipe,
    ),
    isFullScreenShadow: readFlag(
      params,
      'isFullScreenShadow',
      base.isFullScreenShadow,
    ),
    isCustomAnimation: readFlag(
      params,
      'isCustomAnimation',
      base.isCustomAnimation,
    ),
    swipeDirection: readChoice(
      params,
      'swipeDirection',
      SWIPE_DIRECTIONS,
      base.swipeDirection,
    ),
    area: readChoice(params, 'area', SWIPE_AREAS, base.area),
    isKeyboardHidden: readFlag(
      params,
      'isKeyboardHidden',
      base.isKeyboardHidden,
    ),
    isDismissPrevented: readFlag(
      params,
      'isDismissPrevented',
      base.isDismissPrevented,
    ),
    isNativeBackDismissal: readFlag(
      params,
      'isNativeBackDismissal',
      base.isNativeBackDismissal,
    ),
    dismissAttempts: readCount(params, 'dismissAttempts', base.dismissAttempts),
    gestureCancels: readCount(params, 'gestureCancels', base.gestureCancels),
  };
}

function responseDistanceOf(area: ISwipeArea, window: IWindowSize) {
  switch (area) {
    case 'bottomHalf':
      return {
        start: 0,
        end: window.width,
        top: window.height / 2,
        bottom: window.height,
      };
    case 'centerColumn':
      return {
        start: window.width * CENTER_COLUMN_START,
        end: window.width * CENTER_COLUMN_END,
        top: 0,
        bottom: window.height,
      };
    case 'whole':
      return undefined;
  }
}

// The options the settings decide, the event callbacks are added by the screen
export function gestureOptionsOf(
  settings: IGesturesSettings,
  window: IWindowSize,
): IScreenOptions {
  return {
    stackPresentation: settings.isModal ? 'modal' : undefined,
    gestureEnabled: settings.isGestureEnabled,
    fullScreenSwipeEnabled: settings.isFullScreenSwipe,
    fullScreenSwipeShadowEnabled: settings.isFullScreenShadow,
    customAnimationOnSwipe: settings.isCustomAnimation,
    swipeDirection: settings.swipeDirection,
    gestureResponseDistance: responseDistanceOf(settings.area, window),
    hideKeyboardOnSwipe: settings.isKeyboardHidden,
    preventNativeDismiss: settings.isDismissPrevented,
    nativeBackButtonDismissalEnabled: settings.isNativeBackDismissal,
  };
}
