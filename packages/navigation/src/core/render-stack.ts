// Render half of the navigator: plain props for the `RNSScreen`/`RNSScreenStack` leaves and one
// header config `Descriptor` that never takes framework children
// A search bar nests in a `RNSScreenStackHeaderSubview`, native rejects it as a bare child

import { el } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import {
  HEADER_ON_PRESS_BAR_BUTTON_ITEM,
  HEADER_ON_PRESS_BAR_BUTTON_MENU_ITEM,
  RNS_MODAL_SCREEN_VIEW_NAME,
  RNS_SCREEN_STACK_HEADER_CONFIG_VIEW_NAME,
  RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME,
  RNS_SCREEN_VIEW_NAME,
  RNS_SEARCH_BAR_VIEW_NAME,
  SEARCH_BAR_ON_BLUR,
  SEARCH_BAR_ON_CANCEL_BUTTON_PRESS,
  SEARCH_BAR_ON_CHANGE_TEXT,
  SEARCH_BAR_ON_CLOSE,
  SEARCH_BAR_ON_FOCUS,
  SEARCH_BAR_ON_OPEN,
  SEARCH_BAR_ON_SEARCH_BUTTON_PRESS,
  STACK_DEFAULT_ANIMATION,
  STACK_DEFAULT_PRESENTATION,
} from './constants';
import { resolveContentWrapper } from './content-wrapper';
import {
  findAncestorEdgeInsets,
  resolveEdgeInsetApplication,
} from './edge-insets';
import type {
  IEdgeInsetApplication,
  IEdgeInsetScope,
  IEdgeInsetState,
} from './edge-insets';
import { resolveHeaderSubviewProps } from './header-subviews';
import { computeActivityState } from './navigator-state';
import { resolveSafeAreaHost } from './safe-area-view';
import type { ISafeAreaHost } from './safe-area-view';
import { featureFlags } from './screens-config';
import type {
  IHeaderConfigViewProps,
  INavigatorPlatform,
  IScreenEventPayloads,
  IScreenOptions,
  IScreenViewProps,
  ISearchBarOptions,
  ISearchBarViewProps,
  IStackPresentation,
  IStackViewProps,
} from './navigator-props';
import {
  resolveHeaderOptionEvents,
  resolveScreenOptionEvents,
} from './screen-events';
import {
  resolveHeaderConfigView,
  resolveScreenView,
  resolveSearchBarView,
} from './screen-options';
import type { ITransitionProgress } from './transition-progress';

// A modal screen is `RNSModalScreen`: native skips Yoga's frame for that class and lays it out
// A plain `RNSScreen` there gets the push-stack frame and shifts the modal down a full screen
// Mirrors `shouldUseModalScreenComponent`, iOS only since Android sizes modals natively
export function resolveScreenViewName(
  stackPresentation: IStackPresentation | undefined,
  isAndroid: boolean,
): string {
  if (isAndroid) return RNS_SCREEN_VIEW_NAME;
  const isPlainPresentation =
    stackPresentation === undefined ||
    stackPresentation === 'push' ||
    stackPresentation === 'containedModal' ||
    stackPresentation === 'containedTransparentModal';
  return isPlainPresentation
    ? RNS_SCREEN_VIEW_NAME
    : RNS_MODAL_SCREEN_VIEW_NAME;
}

// A modal has no `UINavigationController` on iOS, so the header bar has nothing to attach to
// Screens nests header and content in an inner `RNSScreenStack`/`RNSScreen` pair, and so do we
// Android needs no host for its header
export function isHeaderInModal(
  stackPresentation: IStackPresentation | undefined,
  headerHidden: boolean,
  isAndroid: boolean,
): boolean {
  if (isAndroid) return false;
  return (
    (stackPresentation ?? STACK_DEFAULT_PRESENTATION) !== 'push' &&
    !headerHidden
  );
}

// Inner-modal wrapper styles for isHeaderInModal: the inner RNSScreenStack fills its outer
// RNSScreen, and the inner RNSScreen fills the stack absolutely on all four edges. This mirrors
// react-native-screens' own `styles.container` / `StyleSheet.absoluteFill` for this exact pair.
const HEADER_IN_MODAL_STACK_STYLE = { flex: 1 };
const HEADER_IN_MODAL_SCREEN_STYLE = {
  position: 'absolute',
  top: 0,
  start: 0,
  end: 0,
  bottom: 0,
};

export function resolveHeaderInModalStackStyle(): Record<string, unknown> {
  return HEADER_IN_MODAL_STACK_STYLE;
}

export function resolveHeaderInModalScreenStyle(): Record<string, unknown> {
  return HEADER_IN_MODAL_SCREEN_STYLE;
}

// The RNSScreen leaf's own props; the adapter spreads this record directly onto the element it
// builds and appends the header config child and real screen content itself, not here.
export function resolveScreenProps(
  view: IScreenViewProps,
): Record<string, unknown> {
  const { passthrough, ...native } = view;
  return {
    ...passthrough,
    ...native,
    stackAnimation: view.stackAnimation ?? STACK_DEFAULT_ANIMATION,
    stackPresentation: view.stackPresentation ?? STACK_DEFAULT_PRESENTATION,
    // A `formSheet` pushes its live size into Fabric state every drag frame and the
    // `ScrollView` frame fix reads that state, the vendor sends the flag for every screen
    synchronousShadowStateUpdatesEnabled:
      featureFlags.experiment.synchronousScreenUpdatesEnabled,
  };
}

// `style: {flex: 1}` is ours, not react-native-screens': RNSScreenStackView sizes its nav
// controller to `self.bounds`, which Yoga would otherwise collapse to zero, and (unlike RN's
// own ScreenStack.tsx) we drive the native view directly (<third_party_rn_packages_are_react_only>).
export function resolveStackProps(
  view: IStackViewProps,
): Record<string, unknown> {
  return { style: { flex: 1 }, ...view.passthrough };
}

// Out of the flow so the header takes no room from the content, a row so subviews sit in line
const HEADER_CONFIG_STYLE = {
  position: 'absolute',
  width: '100%',
  flexDirection: 'row',
  justifyContent: 'space-between',
};

// Only iOS centers the subviews, on Android the toolbar places them itself
const HEADER_CONFIG_IOS_STYLE = {
  ...HEADER_CONFIG_STYLE,
  alignItems: 'center',
};

// The header config is a `Descriptor` since it never hosts framework children
// `searchBarProps` nests as a `RNSSearchBar` in a `RNSScreenStackHeaderSubview`, omitted when
// the screen has no search bar
export function renderHeaderConfig(
  view: IHeaderConfigViewProps,
  insets: IEdgeInsetApplication,
  isAndroid: boolean,
  searchBarProps?: Record<string, unknown>,
): IDescriptor {
  const {
    passthrough,
    onPressHeaderBarButtonItem,
    onPressHeaderBarButtonMenuItem,
    ...native
  } = view;
  const props: Record<string, unknown> = {
    ...passthrough,
    ...native,
    style: isAndroid ? HEADER_CONFIG_STYLE : HEADER_CONFIG_IOS_STYLE,
    pointerEvents: 'box-none',
    // Android only: `CustomToolbar.kt` pads by window insets when these are set
    consumeTopInset: insets.consumeTopInset,
    consumeLeftInset: insets.consumeLeftInset,
    consumeRightInset: insets.consumeRightInset,
    consumeBottomInset: insets.consumeBottomInset,
    legacyTopInsetBehavior:
      view.legacyTopInsetBehavior ?? insets.legacyTopInsetBehavior,
    synchronousShadowStateUpdatesEnabled:
      featureFlags.experiment.synchronousHeaderConfigUpdatesEnabled,
    [HEADER_ON_PRESS_BAR_BUTTON_ITEM]: onPressHeaderBarButtonItem,
    [HEADER_ON_PRESS_BAR_BUTTON_MENU_ITEM]: onPressHeaderBarButtonMenuItem,
  };
  const children = searchBarProps
    ? [
        el(
          RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME,
          resolveHeaderSubviewProps('searchBar'),
          [el(RNS_SEARCH_BAR_VIEW_NAME, searchBarProps)],
        ),
      ]
    : [];
  return el(RNS_SCREEN_STACK_HEADER_CONFIG_VIEW_NAME, props, children);
}

// The RNSSearchBar leaf's static config props; event handlers ride in `passthrough`.
// renderHeaderConfig wraps this into the RNSSearchBar Descriptor and nests it as the header
// config's child.
export function resolveSearchBarProps(
  view: ISearchBarViewProps,
): Record<string, unknown> {
  return {
    ...view.passthrough,
    placeholder: view.placeholder,
    autoCapitalize: view.autoCapitalize,
    placement: view.placement,
    hideWhenScrolling: view.hideWhenScrolling,
    allowToolbarIntegration: view.allowToolbarIntegration,
    obscureBackground: view.obscureBackground,
    hideNavigationBar: view.hideNavigationBar,
    cancelButtonText: view.cancelButtonText,
    barTintColor: view.barTintColor,
    tintColor: view.tintColor,
    textColor: view.textColor,
    autoFocus: view.autoFocus,
    disableBackButtonOverride: view.disableBackButtonOverride,
    inputType: view.inputType,
    hintTextColor: view.hintTextColor,
    headerIconColor: view.headerIconColor,
    shouldShowHintSearchIcon: view.shouldShowHintSearchIcon,
  };
}

// The 7 search-bar event keys -> option-callback passthrough: zero lifecycle dependency, so every
// adapter built the identical map by hand. `log` is an optional per-event hook so an adapter can
// still attach its own route-scoped dlog line (React/Vue do; Angular doesn't) without forking the
// map itself.
export function buildSearchBarPassthrough(
  options: ISearchBarOptions,
  log?: (message: string) => void,
): Record<string, (event: ISymbioteEvent) => void> {
  return {
    [SEARCH_BAR_ON_FOCUS]: () => {
      log?.('search bar focused');
      options.onFocus?.();
    },
    [SEARCH_BAR_ON_BLUR]: () => {
      log?.('search bar blurred');
      options.onBlur?.();
    },
    [SEARCH_BAR_ON_CHANGE_TEXT]: (event: ISymbioteEvent) => {
      const { text } = event.nativeEvent;
      const changedText = typeof text === 'string' ? text : '';
      log?.(`search text changed: ${changedText}`);
      options.onChangeText?.(changedText);
    },
    [SEARCH_BAR_ON_SEARCH_BUTTON_PRESS]: (event: ISymbioteEvent) => {
      const { text } = event.nativeEvent;
      const pressedText = typeof text === 'string' ? text : '';
      log?.(`search button pressed: ${pressedText}`);
      options.onSearchButtonPress?.(pressedText);
    },
    [SEARCH_BAR_ON_CANCEL_BUTTON_PRESS]: () => {
      log?.('search bar cancel pressed');
      options.onCancelButtonPress?.();
    },
    [SEARCH_BAR_ON_CLOSE]: () => {
      log?.('search bar closed');
      options.onClose?.();
    },
    [SEARCH_BAR_ON_OPEN]: () => {
      log?.('search bar opened');
      options.onOpen?.();
    },
  };
}

// In a header-in-modal pair the inner screen holds the scroll view and the header, so it takes
// these props, the outer screen must not report them twice
const INNER_SCREEN_KEYS = [
  'topScrollEdgeEffect',
  'bottomScrollEdgeEffect',
  'leftScrollEdgeEffect',
  'rightScrollEdgeEffect',
  'onHeaderHeightChange',
] as const satisfies readonly (
  keyof IScreenViewProps | keyof IScreenEventPayloads
)[];

function splitInnerScreenProps(
  screenProps: Record<string, unknown>,
  inModal: boolean,
): { outer: Record<string, unknown>; inner: Record<string, unknown> } {
  if (!inModal) return { outer: screenProps, inner: {} };
  const outer = { ...screenProps };
  const inner: Record<string, unknown> = {};
  for (const key of INNER_SCREEN_KEYS) {
    inner[key] = outer[key];
    delete outer[key];
  }
  return { outer, inner };
}

function resolvePlanSearchBarProps(
  input: IScreenRenderPlanInput,
): Record<string, unknown> | undefined {
  const searchBarOptions = input.options?.headerSearchBarOptions;
  if (!searchBarOptions) return undefined;
  return resolveSearchBarProps(
    resolveSearchBarView(searchBarOptions, input.searchBarPassthrough ?? {}),
  );
}

// The framework-agnostic half of one `RNSScreen` entry, built from merged route options
// Events arrive wired via `screenPassthrough`/`searchBarPassthrough`, elements stay adapter-owned
export type IScreenRenderPlanInput = {
  screenId: string;
  index: number;
  routeCount: number;
  options: IScreenOptions | undefined;
  platform: INavigatorPlatform;
  isAndroid: boolean;
  screenPassthrough: Record<string, unknown>;
  // The scope of the screen this one is nested in, its header may already have taken the insets
  parentScope?: IEdgeInsetScope;
  // Set by a stack route whose screen reads its transition, it registers the native listener
  transitionProgress?: ITransitionProgress;
  // Already includes the imperative ref key where an adapter wires one (React/Vue); Angular wires
  // its ref via a directive instead, so its map never carries one. Omitted entirely when the
  // screen has no search bar.
  searchBarPassthrough?: Record<string, unknown>;
};

export type IScreenRenderPlan = {
  activityState: number;
  // The outer RNSScreen/RNSModalScreen Fabric component name (resolveScreenViewName).
  screenViewName: string;
  screenProps: Record<string, unknown>;
  // Header `Descriptor`, with a nested `RNSSearchBar` child when the screen has one
  // React and Vue bridge it verbatim, Angular reads only `.props` and renders the search bar itself
  headerConfig: IDescriptor;
  // What the screens below this header read as their enclosing state, the adapter files it in scope
  edgeInsets: IEdgeInsetState;
  // The RNSSearchBar leaf's own props, standalone from `headerConfig` for the adapters (Angular)
  // that mount it as a separate host element rather than through `headerConfig`'s children.
  // undefined when the screen has no search bar.
  searchBarProps: Record<string, unknown> | undefined;
  // Always includes `collapsable: false` (see RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME's rationale in
  // core/constants.ts) - every adapter passed this exact pair together, never the style alone.
  contentWrapperProps: Record<string, unknown>;
  // Wraps the screen component inside the content wrapper, undefined below iOS 26
  safeAreaHost: ISafeAreaHost | undefined;
  inModal: boolean;
  innerStackStyle: Record<string, unknown>;
  innerScreenProps: Record<string, unknown>;
};

// Kept apart so the plan reads as one line per part: the header, its search bar leaf and the
// inset state the screens below inherit are all decided from the same insets
function resolvePlanHeader(
  input: IScreenRenderPlanInput,
  isHeaderHidden: boolean,
): Pick<IScreenRenderPlan, 'headerConfig' | 'edgeInsets' | 'searchBarProps'> {
  const { options } = input;
  const searchBarProps = resolvePlanSearchBarProps(input);
  const insets = resolveEdgeInsetApplication(
    findAncestorEdgeInsets(input.parentScope),
    { ...options, headerVisible: !isHeaderHidden },
  );
  // `renderHeaderConfig` puts `searchBarProps` into `children` only, so Angular, which ignores
  // `children`, can take the same descriptor
  const headerConfig = renderHeaderConfig(
    resolveHeaderConfigView(
      options,
      input.platform,
      resolveHeaderOptionEvents(options ?? {}),
    ),
    insets,
    input.isAndroid,
    searchBarProps,
  );
  return { headerConfig, edgeInsets: insets.next, searchBarProps };
}

export function resolveScreenRenderPlan(
  input: IScreenRenderPlanInput,
): IScreenRenderPlan {
  const { options, isAndroid } = input;
  const activityState = computeActivityState(input.index, input.routeCount);
  const allScreenProps = resolveScreenProps(
    resolveScreenView(input.screenId, activityState, options, {
      ...input.screenPassthrough,
      ...resolveScreenOptionEvents(options ?? {}, input.transitionProgress),
    }),
  );
  const isHeaderHidden = options?.headerShown === false;
  const inModal = isHeaderInModal(
    options?.stackPresentation,
    isHeaderHidden,
    isAndroid,
  );
  const { outer, inner } = splitInnerScreenProps(allScreenProps, inModal);
  const header = resolvePlanHeader(input, isHeaderHidden);
  const contentWrapper = resolveContentWrapper({
    stackPresentation: options?.stackPresentation,
    headerHidden: isHeaderHidden,
    headerTranslucent: options?.headerTranslucent,
    isAndroid,
    sheetAllowedDetents: options?.sheetAllowedDetents,
    contentStyle: options?.contentStyle,
  });
  return {
    activityState,
    screenViewName: resolveScreenViewName(
      options?.stackPresentation,
      isAndroid,
    ),
    screenProps:
      contentWrapper.screenStyle === undefined
        ? outer
        : { ...outer, style: contentWrapper.screenStyle },
    ...header,
    contentWrapperProps: { style: contentWrapper.style, collapsable: false },
    safeAreaHost: resolveSafeAreaHost(options ?? {}, input.platform),
    inModal,
    innerStackStyle: resolveHeaderInModalStackStyle(),
    innerScreenProps: {
      style: resolveHeaderInModalScreenStyle(),
      activityState,
      ...inner,
    },
  };
}
