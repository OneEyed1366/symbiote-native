// StatusBar renders no Fabric view, it drives the `StatusBarManager` module through a props stack
// An adapter calls `createEntry()` on mount, `apply(props)` on every change, `release()` on unmount

import type { IColorValue } from '../platform-color';

export type IStatusBarStyle = 'default' | 'light-content' | 'dark-content';

// The native `withAnimation` argument of iOS `setHidden`
export type IStatusBarAnimation = 'none' | 'fade' | 'slide';

export const STATUS_BAR_MANAGER = 'StatusBarManager';

export const STATIC_HIDE_TRANSITION: IStatusBarAnimation = 'none';

export type IStatusBarProps = {
  barStyle?: IStatusBarStyle;
  hidden?: boolean;
  animated?: boolean;
  // iOS-only, the transition used when `hidden` changes while `animated`
  showHideTransition?: IStatusBarAnimation;
  networkActivityIndicatorVisible?: boolean;
  // Android-only
  backgroundColor?: IColorValue;
  translucent?: boolean;
};

// What one mounted StatusBar contributes, a prop it did not set stays `null` / `undefined`
export type IStatusBarStackEntry = {
  backgroundColor: { value: IColorValue; animated: boolean } | null;
  barStyle: { value: IStatusBarStyle; animated: boolean } | null;
  translucent: boolean | undefined;
  hidden: {
    value: boolean;
    animated: boolean;
    transition: IStatusBarAnimation;
  } | null;
  networkActivityIndicatorVisible: boolean | undefined;
};

// The stack merged over the defaults, every field present
export type IStatusBarMerged = {
  backgroundColor: { value: IColorValue; animated: boolean };
  barStyle: { value: IStatusBarStyle; animated: boolean };
  translucent: boolean;
  hidden: {
    value: boolean;
    animated: boolean;
    transition: IStatusBarAnimation;
  };
  networkActivityIndicatorVisible: boolean;
};

// RN's static API, a setter for the other platform warns and does nothing
export type IStatusBarImperative = {
  setBarStyle(style: IStatusBarStyle, animated?: boolean): void;
  setHidden(hidden: boolean, animation?: IStatusBarAnimation): void;
  setNetworkActivityIndicatorVisible(visible: boolean): void;
  setBackgroundColor(color: IColorValue, animated?: boolean): void;
  setTranslucent(translucent: boolean): void;
  pushStackEntry(props: IStatusBarProps): IStatusBarStackEntry;
  popStackEntry(entry: IStatusBarStackEntry): void;
  replaceStackEntry(
    entry: IStatusBarStackEntry,
    props: IStatusBarProps,
  ): IStatusBarStackEntry;
};

// One mounted StatusBar's slot in the stack
export type IStatusBarEntryHandle = {
  apply(props: IStatusBarProps): void;
  release(): void;
};

export type IStatusBarController = {
  createEntry(): IStatusBarEntryHandle;
  imperative: IStatusBarImperative;
  currentHeight(): number | undefined;
};
