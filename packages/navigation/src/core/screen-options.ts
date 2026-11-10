// Pure folds from a route's agnostic IScreenOptions into the native view-props shapes
// (RNSScreen + RNSScreenStackHeaderConfig + RNSSearchBar paint from). Framework-agnostic and
// shared verbatim by every adapter - the adapter's own job is only wiring identity (screenId),
// position (activityState via computeActivityState) and the lifecycle event handlers into
// `passthrough`.
//
// The header bar-button payload+dispatch cluster (id-tagging, onPress lookup) lives in
// header-bar-buttons.ts - self-contained, consumed here only as a black box by
// resolveHeaderConfigView.

import type {
  IHeaderConfigViewProps,
  INavigatorPlatform,
  IOptionalBooleanNativeProp,
  IScreenOptions,
  IScreenViewProps,
  ISearchBarOptions,
  ISearchBarViewProps,
} from './navigator-props';
import {
  buildHeaderBarButtonDispatch,
  prepareHeaderBarButtonItems,
} from './header-bar-buttons';
import { featureFlags, isAndroidForCurrentPlatform } from './screens-config';
import {
  resolveSheetAllowedDetents,
  resolveSheetInitialDetent,
  resolveSheetLargestUndimmedDetent,
} from './sheet-detents';

function toOptionalBooleanNativeProp(
  value: boolean | undefined,
): IOptionalBooleanNativeProp {
  if (value === undefined) return 'undefined';
  return value ? 'true' : 'false';
}

// Gesture, system bar and scroll edge fields, read from a defaulted `options` so no read branches
function resolveScreenBehaviorView(options: IScreenOptions) {
  const {
    start = -1,
    end = -1,
    top = -1,
    bottom = -1,
  } = options.gestureResponseDistance ?? {};
  const edges = options.scrollEdgeEffects ?? {};
  return {
    customAnimationOnSwipe: options.customAnimationOnSwipe,
    fullScreenSwipeEnabled: toOptionalBooleanNativeProp(
      options.fullScreenSwipeEnabled,
    ),
    fullScreenSwipeShadowEnabled: options.fullScreenSwipeShadowEnabled,
    gestureResponseDistance: { start, end, top, bottom },
    swipeDirection: options.swipeDirection,
    hideKeyboardOnSwipe: options.hideKeyboardOnSwipe,
    nativeBackButtonDismissalEnabled: options.nativeBackButtonDismissalEnabled,
    preventNativeDismiss: options.preventNativeDismiss,
    replaceAnimation: options.replaceAnimation,
    homeIndicatorHidden: options.homeIndicatorHidden,
    statusBarColor: options.statusBarColor,
    statusBarTranslucent: options.statusBarTranslucent,
    navigationBarColor: options.navigationBarColor,
    navigationBarTranslucent: options.navigationBarTranslucent,
    navigationBarHidden: options.navigationBarHidden,
    topScrollEdgeEffect: edges.top,
    bottomScrollEdgeEffect: edges.bottom,
    leftScrollEdgeEffect: edges.left,
    rightScrollEdgeEffect: edges.right,
    androidResetScreenShadowStateOnOrientationChangeEnabled:
      options.androidResetScreenShadowStateOnOrientationChangeEnabled ??
      featureFlags.experiment
        .androidResetScreenShadowStateOnOrientationChangeEnabled,
    iosOrientationInheritanceFixEnabled:
      options.iosOrientationInheritanceFixEnabled ??
      featureFlags.experiment.iosOrientationInheritanceFixEnabled,
  };
}

// Native names these flags in the hiding sense, the app's visible/enabled flags are inverted
export function negateOptional(
  value: boolean | undefined,
): boolean | undefined {
  return value === undefined ? undefined : !value;
}

// Header fonts, shadows and back button fields, read from a defaulted `options`
function resolveHeaderAppearanceView(options: IScreenOptions) {
  const {
    fontFamily: titleFontFamily,
    fontSize: titleFontSize,
    fontWeight: titleFontWeight,
  } = options.headerTitleStyle ?? {};
  const { fontFamily: backTitleFontFamily, fontSize: backTitleFontSize } =
    options.headerBackTitleStyle ?? {};
  const {
    fontFamily: largeTitleFontFamily,
    fontSize: largeTitleFontSize,
    fontWeight: largeTitleFontWeight,
    color: largeTitleColor,
  } = options.headerLargeTitleStyle ?? {};
  return {
    titleFontFamily,
    titleFontSize,
    titleFontWeight,
    backTitleFontFamily,
    backTitleFontSize,
    largeTitleFontFamily,
    largeTitleFontSize,
    largeTitleFontWeight,
    largeTitleColor,
    hideShadow: negateOptional(options.headerShadowVisible),
    largeTitleHideShadow: negateOptional(options.headerLargeTitleShadowVisible),
    hideBackButton: negateOptional(options.headerBackVisible),
    disableBackButtonMenu: negateOptional(options.headerBackButtonMenuEnabled),
    blurEffect: options.headerBlurEffect,
    backButtonInCustomView: options.headerBackButtonInCustomView,
    topInsetEnabled: options.headerTopInsetEnabled,
    legacyTopInsetBehavior: options.headerLegacyTopInsetBehavior,
    direction: options.headerDirection,
  };
}

export function resolveHeaderConfigView(
  options: IScreenOptions | undefined,
  platform: INavigatorPlatform,
  passthrough: Record<string, unknown> = {},
): IHeaderConfigViewProps {
  const opts = options ?? {};
  const leftItems = platform.headerBarButtonsAvailable
    ? opts.headerLeftBarButtonItems
    : undefined;
  const rightItems = platform.headerBarButtonsAvailable
    ? opts.headerRightBarButtonItems
    : undefined;
  return {
    title: opts.title,
    hidden: opts.headerShown === false,
    backTitle: opts.headerBackTitle,
    backTitleVisible: platform.defaultHeaderBackTitleVisible,
    backButtonDisplayMode: opts.headerBackButtonDisplayMode,
    largeTitle: opts.headerLargeTitle,
    translucent: opts.headerTranslucent,
    color: opts.headerTintColor,
    titleColor: opts.headerTitleColor,
    backgroundColor: opts.headerStyle?.backgroundColor,
    largeTitleBackgroundColor: opts.headerLargeStyle?.backgroundColor,
    userInterfaceStyle: opts.headerUserInterfaceStyle,
    headerLeftBarButtonItems: prepareHeaderBarButtonItems(leftItems, 'left'),
    headerRightBarButtonItems: prepareHeaderBarButtonItems(rightItems, 'right'),
    ...buildHeaderBarButtonDispatch(leftItems, rightItems),
    ...resolveHeaderAppearanceView(opts),
    passthrough,
  };
}

export function resolveScreenView(
  screenId: string,
  activityState: number,
  options: IScreenOptions | undefined,
  passthrough: Record<string, unknown> = {},
): IScreenViewProps {
  const opts = options ?? {};
  const sheetAllowedDetents = resolveSheetAllowedDetents(
    opts.sheetAllowedDetents,
    isAndroidForCurrentPlatform,
  );
  const lastDetentIndex = sheetAllowedDetents.length - 1;
  return {
    screenId,
    activityState,
    gestureEnabled: opts.gestureEnabled,
    stackAnimation: opts.stackAnimation,
    stackPresentation: opts.stackPresentation,
    transitionDuration: opts.transitionDuration,
    sheetAllowedDetents,
    sheetLargestUndimmedDetent: resolveSheetLargestUndimmedDetent(
      opts.sheetLargestUndimmedDetentIndex,
      lastDetentIndex,
    ),
    sheetInitialDetent: resolveSheetInitialDetent(
      opts.sheetInitialDetentIndex,
      lastDetentIndex,
    ),
    sheetGrabberVisible: opts.sheetGrabberVisible,
    sheetCornerRadius: opts.sheetCornerRadius,
    // The vendor defaults this to `true` in JS while the native spec says `false`
    sheetExpandsWhenScrolledToEdge: opts.sheetExpandsWhenScrolledToEdge ?? true,
    sheetElevation: opts.sheetElevation,
    sheetShouldOverflowTopInset: opts.sheetShouldOverflowTopInset,
    sheetDefaultResizeAnimationEnabled: opts.sheetDefaultResizeAnimationEnabled,
    statusBarStyle: opts.statusBarStyle,
    statusBarHidden: opts.statusBarHidden,
    statusBarAnimation: opts.statusBarAnimation,
    screenOrientation: opts.screenOrientation,
    ...resolveScreenBehaviorView(opts),
    passthrough,
  };
}

// RNSSearchBar is a standalone Fabric leaf (react-native-screens mounts it as a header-subview
// child in its own JS component) - resolveSearchBarView only folds the static config surface;
// where/how the adapter mounts the resulting leaf in the header tree is an adapter concern.
export function resolveSearchBarView(
  options: ISearchBarOptions | undefined,
  passthrough: Record<string, unknown> = {},
): ISearchBarViewProps {
  const opts = options ?? {};
  return {
    placeholder: opts.placeholder,
    autoCapitalize: opts.autoCapitalize,
    placement: opts.placement,
    hideWhenScrolling: opts.hideWhenScrolling,
    allowToolbarIntegration: opts.allowToolbarIntegration,
    obscureBackground: toOptionalBooleanNativeProp(opts.obscureBackground),
    hideNavigationBar: toOptionalBooleanNativeProp(opts.hideNavigationBar),
    cancelButtonText: opts.cancelButtonText,
    barTintColor: opts.barTintColor,
    tintColor: opts.tintColor,
    textColor: opts.textColor,
    autoFocus: opts.autoFocus,
    disableBackButtonOverride: opts.disableBackButtonOverride,
    inputType: opts.inputType,
    hintTextColor: opts.hintTextColor,
    headerIconColor: opts.headerIconColor,
    shouldShowHintSearchIcon: opts.shouldShowHintSearchIcon,
    passthrough,
  };
}
