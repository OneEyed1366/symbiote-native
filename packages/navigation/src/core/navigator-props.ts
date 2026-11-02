// Agnostic screen option types, re-exported by every adapter
// The Stack/Screen component props carry children and a ref, so each adapter types its own
// over this base, same split as `IPressableProps`

import type {
  IColorValue,
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IImageSourceProp } from '@symbiote-native/components';
import type {
  IHeaderBarButtonItem,
  IHeaderBarButtonVisibilityPriority,
} from './header-bar-button-types';

export type IStackAnimation =
  | 'default'
  | 'flip'
  | 'simple_push'
  | 'none'
  | 'fade'
  | 'slide_from_right'
  | 'slide_from_left'
  | 'slide_from_bottom'
  | 'fade_from_bottom'
  | 'ios_from_right'
  | 'ios_from_left';

export type IStackPresentation =
  | 'push'
  | 'modal'
  | 'transparentModal'
  | 'fullScreenModal'
  | 'formSheet'
  | 'pageSheet'
  | 'containedModal'
  | 'containedTransparentModal';

export type IHeaderBackButtonDisplayMode = 'minimal' | 'default' | 'generic';

// Nav bar blur and the search field backdrop follow this OS trait, not our color props
// 'unspecified' inherits the SYSTEM appearance, so a dark screen can show a light backdrop
export type IHeaderUserInterfaceStyle = 'unspecified' | 'light' | 'dark';
export type IHeaderDirection = 'ltr' | 'rtl';

// 3-state native boolean: Paper cannot diff `WithDefault<boolean>` against unset, so the
// screens codegen spec models props like `obscureBackground` as this enum
export type IOptionalBooleanNativeProp = 'undefined' | 'false' | 'true';

// Sheet detents of `formSheet`/`pageSheet`, mirroring the screens `sheetAllowedDetents` union
// The fold to the native `number[]` lives in sheet-detents.ts
export type ISheetAllowedDetents =
  number[] | 'fitToContents' | 'large' | 'medium' | 'all';
export type ISheetLargestUndimmedDetent =
  number | 'last' | 'none' | 'all' | 'large' | 'medium';
export type ISheetInitialDetent = number | 'last';

export type {
  IHeaderBarButtonIcon,
  IHeaderBarButtonItem,
  IHeaderBarButtonItemAction,
  IHeaderBarButtonItemBadge,
  IHeaderBarButtonItemMenu,
  IHeaderBarButtonItemSpacing,
  IHeaderBarButtonMenuAction,
  IHeaderBarButtonSubmenu,
  IHeaderBarButtonVisibilityPriority,
} from './header-bar-button-types';

export type ISearchBarAutoCapitalize =
  'systemDefault' | 'none' | 'words' | 'sentences' | 'characters';

export type ISearchBarPlacement =
  | 'automatic'
  | 'inline'
  | 'stacked'
  | 'integrated'
  | 'integratedButton'
  | 'integratedCentered';

// Static `RNSSearchBar` config plus every event callback of the screens `SearchBarProps`
// `onClose`/`onOpen` are Android-only
// The imperative ref carries a framework type, so it is per-adapter (`IReactSearchBarOptions`)
export type ISearchBarOptions = {
  placeholder?: string;
  autoCapitalize?: ISearchBarAutoCapitalize;
  placement?: ISearchBarPlacement;
  hideWhenScrolling?: boolean;
  allowToolbarIntegration?: boolean;
  obscureBackground?: boolean;
  hideNavigationBar?: boolean;
  cancelButtonText?: string;
  barTintColor?: IColorValue;
  tintColor?: IColorValue;
  textColor?: IColorValue;
  autoFocus?: boolean;
  disableBackButtonOverride?: boolean;
  inputType?: string;
  hintTextColor?: IColorValue;
  headerIconColor?: IColorValue;
  shouldShowHintSearchIcon?: boolean;
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onCancelButtonPress?: () => void;
  onSearchButtonPress?: (text: string) => void;
  // Android only, per react-native-screens' own SearchBarProps comment.
  onClose?: () => void;
  onOpen?: () => void;
};

export type IScreenOrientation =
  | 'default'
  | 'all'
  | 'portrait'
  | 'portrait_up'
  | 'portrait_down'
  | 'landscape'
  | 'landscape_left'
  | 'landscape_right';

export type IScrollEdgeEffect = 'automatic' | 'hard' | 'soft' | 'hidden';

export type IScrollEdgeEffects = {
  top?: IScrollEdgeEffect;
  bottom?: IScrollEdgeEffect;
  left?: IScrollEdgeEffect;
  right?: IScrollEdgeEffect;
};

export type ISwipeDirection = 'vertical' | 'horizontal';

export type IReplaceAnimation = 'pop' | 'push';

export type IGestureResponseDistance = {
  start?: number;
  end?: number;
  top?: number;
  bottom?: number;
};

export type IHeaderTitleStyle = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
};

export type IHeaderBackTitleStyle = Pick<
  IHeaderTitleStyle,
  'fontFamily' | 'fontSize'
>;

export type IHeaderLargeTitleStyle = IHeaderTitleStyle & {
  color?: IColorValue;
};

// iOS only, the values of the screens `BlurEffect` union
export type IHeaderBlurEffect =
  | 'none'
  | 'extraLight'
  | 'light'
  | 'dark'
  | 'regular'
  | 'prominent'
  | 'systemUltraThinMaterial'
  | 'systemThinMaterial'
  | 'systemMaterial'
  | 'systemThickMaterial'
  | 'systemChromeMaterial'
  | 'systemUltraThinMaterialLight'
  | 'systemThinMaterialLight'
  | 'systemMaterialLight'
  | 'systemThickMaterialLight'
  | 'systemChromeMaterialLight'
  | 'systemUltraThinMaterialDark'
  | 'systemThinMaterialDark'
  | 'systemMaterialDark'
  | 'systemThickMaterialDark'
  | 'systemChromeMaterialDark';

// Payload of each `RNSScreen` event the app can listen to, keyed by the native event prop name
// Native sends booleans as numbers here, so `closing` and `goingForward` are 0 or 1
export type IScreenEventPayloads = {
  onNativeDismissCancelled: { dismissCount: number };
  onHeaderHeightChange: { headerHeight: number };
  onTransitionProgress: {
    progress: number;
    closing: number;
    goingForward: number;
  };
  onGestureCancel: Record<string, never>;
  onSheetDetentChanged: { index: number; isStable: boolean };
};

export type IScreenEventCallbacks = {
  [K in keyof IScreenEventPayloads]?: (
    payload: IScreenEventPayloads[K],
  ) => void;
};

// The agnostic per-screen options surface: header title/appearance, transition tuning, sheet
// detents (formSheet/pageSheet), header bar-button items, the search bar, and the
// translucent/status-bar family. The gamma-line stack host remains deferred - see packages/
// navigation's README for the explicit split. `headerSearchBarOptions` folds through
// resolveSearchBarView/resolveSearchBarProps into a SEPARATE RNSSearchBar leaf, not into this
// record's own native view - see render-stack.ts.
export type IScreenOptions = {
  title?: string;
  headerShown?: boolean;
  headerTitleColor?: IColorValue;
  headerStyle?: { backgroundColor?: IColorValue };
  headerTintColor?: IColorValue;
  headerBackTitle?: string;
  headerBackButtonDisplayMode?: IHeaderBackButtonDisplayMode;
  headerLargeTitle?: boolean;
  // react-native-screens tracks the large-title (scroll-edge) appearance SEPARATELY from the
  // compact/collapsed one - headerStyle.backgroundColor only colors the latter. Left unset with
  // headerLargeTitle: true, the expanded state falls back to the system default (white), which
  // reads as a stray white band against a dark theme. Naming mirrors @react-navigation/
  // native-stack's own headerLargeStyle for the same prop.
  headerLargeStyle?: { backgroundColor?: IColorValue };
  headerUserInterfaceStyle?: IHeaderUserInterfaceStyle;
  headerTranslucent?: boolean;
  headerLeftBarButtonItems?: IHeaderBarButtonItem[];
  headerRightBarButtonItems?: IHeaderBarButtonItem[];
  headerSearchBarOptions?: ISearchBarOptions;
  gestureEnabled?: boolean;
  stackAnimation?: IStackAnimation;
  stackPresentation?: IStackPresentation;
  transitionDuration?: number;
  sheetAllowedDetents?: ISheetAllowedDetents;
  sheetLargestUndimmedDetentIndex?: ISheetLargestUndimmedDetent;
  sheetInitialDetentIndex?: ISheetInitialDetent;
  sheetGrabberVisible?: boolean;
  sheetCornerRadius?: number;
  sheetExpandsWhenScrolledToEdge?: boolean;
  sheetElevation?: number;
  sheetShouldOverflowTopInset?: boolean;
  sheetDefaultResizeAnimationEnabled?: boolean;
  statusBarStyle?: 'inverted' | 'auto' | 'light' | 'dark';
  statusBarHidden?: boolean;
  statusBarAnimation?: 'none' | 'fade' | 'slide';
  screenOrientation?: IScreenOrientation;
  customAnimationOnSwipe?: boolean;
  fullScreenSwipeEnabled?: boolean;
  fullScreenSwipeShadowEnabled?: boolean;
  gestureResponseDistance?: IGestureResponseDistance;
  swipeDirection?: ISwipeDirection;
  hideKeyboardOnSwipe?: boolean;
  nativeBackButtonDismissalEnabled?: boolean;
  preventNativeDismiss?: boolean;
  replaceAnimation?: IReplaceAnimation;
  homeIndicatorHidden?: boolean;
  statusBarColor?: IColorValue;
  statusBarTranslucent?: boolean;
  navigationBarColor?: IColorValue;
  navigationBarTranslucent?: boolean;
  navigationBarHidden?: boolean;
  scrollEdgeEffects?: IScrollEdgeEffects;
  androidResetScreenShadowStateOnOrientationChangeEnabled?: boolean;
  iosOrientationInheritanceFixEnabled?: boolean;
  headerTitleStyle?: IHeaderTitleStyle;
  headerBackTitleStyle?: IHeaderBackTitleStyle;
  headerLargeTitleStyle?: IHeaderLargeTitleStyle;
  headerShadowVisible?: boolean;
  headerLargeTitleShadowVisible?: boolean;
  headerBackVisible?: boolean;
  headerBackButtonMenuEnabled?: boolean;
  headerBlurEffect?: IHeaderBlurEffect;
  headerBackButtonInCustomView?: boolean;
  headerTopInsetEnabled?: boolean;
  headerLegacyTopInsetBehavior?: boolean;
  // Laid over the view that wraps the screen's content, on an iOS `formSheet` its background moves
  // to the screen itself so it also paints under the bottom safe area inset
  contentStyle?: IStyleProp<IViewStyle>;
  // iOS 26 and later: which edges of the content the safe area insets, an edge left out keeps its
  // default (the top, under an opaque visible header)
  safeAreaEdges?: ISafeAreaEdges;
  // Android: a header opts out of an edge for itself and its whole subtree, as the vendor props do
  disableTopInsetApplication?: boolean;
  disableLeftInsetApplication?: boolean;
  disableRightInsetApplication?: boolean;
  disableBottomInsetApplication?: boolean;
  headerDirection?: IHeaderDirection;
  headerLeftVisibilityPriority?: IHeaderBarButtonVisibilityPriority;
  headerRightVisibilityPriority?: IHeaderBarButtonVisibilityPriority;
  headerLeftBackgroundVisible?: boolean;
  headerRightBackgroundVisible?: boolean;
  headerBackImageSource?: IImageSourceProp;
  onHeaderAttached?: () => void;
  onHeaderDetached?: () => void;
} & IScreenEventCallbacks;

// Per-platform inputs the render needs, explicit so core never reads `Platform.OS`
export type INavigatorPlatform = {
  defaultHeaderBackTitleVisible: boolean;
  headerBarButtonsAvailable: boolean;
  isIOS26OrHigher: boolean;
};

export type ISafeAreaEdge = 'top' | 'right' | 'bottom' | 'left';
export type ISafeAreaEdges = Partial<
  Record<ISafeAreaEdge, boolean | undefined>
>;

// Pre-resolved inputs the RNSScreen native render paints from. Only fields the fold actually
// computes are explicit (screenId, activityState, the resolved options); everything else - the
// native lifecycle/back-button event handlers - rides in `passthrough`, same convention as
// ISliderViewProps.
export type IScreenViewProps = {
  screenId: string;
  activityState: number;
  gestureEnabled?: boolean;
  stackAnimation?: IStackAnimation;
  stackPresentation?: IStackPresentation;
  transitionDuration?: number;
  sheetAllowedDetents?: number[];
  sheetLargestUndimmedDetent?: number;
  sheetInitialDetent?: number;
  sheetGrabberVisible?: boolean;
  sheetCornerRadius?: number;
  sheetExpandsWhenScrolledToEdge?: boolean;
  sheetElevation?: number;
  sheetShouldOverflowTopInset?: boolean;
  sheetDefaultResizeAnimationEnabled?: boolean;
  statusBarStyle?: 'inverted' | 'auto' | 'light' | 'dark';
  statusBarHidden?: boolean;
  statusBarAnimation?: 'none' | 'fade' | 'slide';
  screenOrientation?: IScreenOrientation;
  customAnimationOnSwipe?: boolean;
  fullScreenSwipeEnabled: IOptionalBooleanNativeProp;
  fullScreenSwipeShadowEnabled?: boolean;
  gestureResponseDistance: Required<IGestureResponseDistance>;
  swipeDirection?: ISwipeDirection;
  hideKeyboardOnSwipe?: boolean;
  nativeBackButtonDismissalEnabled?: boolean;
  preventNativeDismiss?: boolean;
  replaceAnimation?: IReplaceAnimation;
  homeIndicatorHidden?: boolean;
  statusBarColor?: IColorValue;
  statusBarTranslucent?: boolean;
  navigationBarColor?: IColorValue;
  navigationBarTranslucent?: boolean;
  navigationBarHidden?: boolean;
  topScrollEdgeEffect?: IScrollEdgeEffect;
  bottomScrollEdgeEffect?: IScrollEdgeEffect;
  leftScrollEdgeEffect?: IScrollEdgeEffect;
  rightScrollEdgeEffect?: IScrollEdgeEffect;
  androidResetScreenShadowStateOnOrientationChangeEnabled?: boolean;
  iosOrientationInheritanceFixEnabled?: boolean;
  passthrough: Record<string, unknown>;
};

export type IHeaderConfigViewProps = {
  title?: string;
  hidden: boolean;
  backTitle?: string;
  backTitleVisible: boolean;
  backButtonDisplayMode?: IHeaderBackButtonDisplayMode;
  largeTitle?: boolean;
  translucent?: boolean;
  color?: IColorValue;
  titleColor?: IColorValue;
  backgroundColor?: IColorValue;
  largeTitleBackgroundColor?: IColorValue;
  userInterfaceStyle?: IHeaderUserInterfaceStyle;
  titleFontFamily?: string;
  titleFontSize?: number;
  titleFontWeight?: string;
  backTitleFontFamily?: string;
  backTitleFontSize?: number;
  largeTitleFontFamily?: string;
  largeTitleFontSize?: number;
  largeTitleFontWeight?: string;
  largeTitleColor?: IColorValue;
  hideShadow?: boolean;
  largeTitleHideShadow?: boolean;
  hideBackButton?: boolean;
  disableBackButtonMenu?: boolean;
  blurEffect?: IHeaderBlurEffect;
  backButtonInCustomView?: boolean;
  topInsetEnabled?: boolean;
  legacyTopInsetBehavior?: boolean;
  direction?: IHeaderDirection;
  // Already native-shaped (buttonId/menuId-tagged, colors run through processColor) - the fold
  // that builds these lives in header-bar-buttons.ts, mirroring RNS's own prepareHeaderBarButtonItems.
  headerLeftBarButtonItems?: unknown[];
  headerRightBarButtonItems?: unknown[];
  onPressHeaderBarButtonItem?: (event: ISymbioteEvent) => void;
  onPressHeaderBarButtonMenuItem?: (event: ISymbioteEvent) => void;
  passthrough: Record<string, unknown>;
};

export type INativeContainerStyle = { backgroundColor?: IColorValue };

export type IStackViewProps = {
  passthrough: Record<string, unknown>;
};

// Resolved inputs of the `RNSSearchBar` leaf, derived from `ISearchBarOptions`
// Only the two 3-state booleans differ, event callbacks ride in `passthrough`
export type ISearchBarViewProps = Omit<
  ISearchBarOptions,
  | 'obscureBackground'
  | 'hideNavigationBar'
  | 'onChangeText'
  | 'onFocus'
  | 'onBlur'
  | 'onCancelButtonPress'
  | 'onSearchButtonPress'
  | 'onClose'
  | 'onOpen'
> & {
  obscureBackground?: IOptionalBooleanNativeProp;
  hideNavigationBar?: IOptionalBooleanNativeProp;
  passthrough: Record<string, unknown>;
};
