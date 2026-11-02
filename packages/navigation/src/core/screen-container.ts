// `ScreenContainer` of react-native-screens: a native host for screens that are not a stack
// Core picks the view, an adapter renders the children and the view props inside it

import { screensEnabled } from './screens-config';

export type IScreenContainerProps = {
  enabled?: boolean;
  hasTwoStates?: boolean;
};

export type IScreenContainerInput = IScreenContainerProps & {
  os: string;
};

const CONTAINER_VIEW_NAME = 'RNSScreenContainer';
const NAVIGATION_CONTAINER_VIEW_NAME = 'RNSScreenNavigationContainer';
const PLAIN_VIEW_NAME = 'view';
const IOS_PLATFORM = 'ios';
const ANDROID_PLATFORM = 'android';

// A container without `enabled` follows the app-wide `enableScreens` switch
// Only iOS has a separate view for navigators that show one screen at a time
export function resolveScreenContainerViewName(
  input: IScreenContainerInput,
): string {
  const { enabled = screensEnabled(), hasTwoStates, os } = input;
  const isIOS = os === IOS_PLATFORM;
  if (!enabled || !(isIOS || os === ANDROID_PLATFORM)) return PLAIN_VIEW_NAME;
  if (hasTwoStates && isIOS) return NAVIGATION_CONTAINER_VIEW_NAME;
  return CONTAINER_VIEW_NAME;
}
