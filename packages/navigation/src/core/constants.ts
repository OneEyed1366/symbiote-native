// Fabric view names and event prop keys of the screens native stack, shared by every adapter
// The engine derives events and color processors from the screens codegen ViewConfig, not from here

// The names are emitted raw, as `descriptorFor` passes any non-`symbiote-` string to Fabric as is
export const RNS_SCREEN_VIEW_NAME = 'RNSScreen';
// The modal twin of `RNSScreen`, `resolveScreenViewName` in `render-stack.ts` says why it is needed
export const RNS_MODAL_SCREEN_VIEW_NAME = 'RNSModalScreen';
export const RNS_SCREEN_STACK_VIEW_NAME = 'RNSScreenStack';
export const RNS_SCREEN_STACK_HEADER_CONFIG_VIEW_NAME =
  'RNSScreenStackHeaderConfig';
// The leaf that hosts a framework child inside the header, one per `type` such as `left` or `back`
// `renderHeaderConfig` takes no framework children, so the adapter mounts them into this leaf
export const RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME =
  'RNSScreenStackHeaderSubview';
export const RNS_SEARCH_BAR_VIEW_NAME = 'RNSSearchBar';
export const RNS_FULL_WINDOW_OVERLAY_VIEW_NAME = 'RNSFullWindowOverlay';
export const RNS_SCREEN_FOOTER_VIEW_NAME = 'RNSScreenFooter';
// Screens wraps every screen content in this view with `collapsable: false`, so Fabric keeps it
// A `formSheet` learns its content size only through the wrapper, a `push` works without it
export const RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME = 'RNSScreenContentWrapper';
// iOS 26 lays a screen out under the navigation bar, this view insets the content back
export const RNS_SAFE_AREA_VIEW_NAME = 'RNSSafeAreaView';

// `RNSScreen` event prop keys, all direct events in the codegen spec
export const SCREEN_ON_APPEAR = 'onAppear';
export const SCREEN_ON_DISAPPEAR = 'onDisappear';
export const SCREEN_ON_WILL_APPEAR = 'onWillAppear';
export const SCREEN_ON_WILL_DISAPPEAR = 'onWillDisappear';
export const SCREEN_ON_DISMISSED = 'onDismissed';
export const SCREEN_ON_HEADER_BACK_BUTTON_CLICKED = 'onHeaderBackButtonClicked';

// `RNSScreenStack` event prop key
export const STACK_ON_FINISH_TRANSITIONING = 'onFinishTransitioning';

// `RNSScreenStackHeaderConfig` event keys: a bar button press, and a press on a menu action
export const HEADER_ON_PRESS_BAR_BUTTON_ITEM = 'onPressHeaderBarButtonItem';
export const HEADER_ON_PRESS_BAR_BUTTON_MENU_ITEM =
  'onPressHeaderBarButtonMenuItem';

// `RNSSearchBar` event prop keys, `onClose` and `onOpen` are Android only
export const SEARCH_BAR_ON_FOCUS = 'onSearchFocus';
export const SEARCH_BAR_ON_BLUR = 'onSearchBlur';
export const SEARCH_BAR_ON_SEARCH_BUTTON_PRESS = 'onSearchButtonPress';
export const SEARCH_BAR_ON_CANCEL_BUTTON_PRESS = 'onCancelButtonPress';
export const SEARCH_BAR_ON_CHANGE_TEXT = 'onChangeText';
export const SEARCH_BAR_ON_CLOSE = 'onClose';
export const SEARCH_BAR_ON_OPEN = 'onOpen';

// `activityState` values the screens reads: 0 detaches a screen, 2 attaches and focuses it
// Native asserts that a mounted screen's value never decreases through a plain prop update
// `computeActivityState` holds the full rationale
export const SCREEN_ACTIVITY_STATE_FOCUSED = 2;
export const SCREEN_ACTIVITY_STATE_INACTIVE = 0;

export const STACK_DEFAULT_ANIMATION = 'default';
export const STACK_DEFAULT_PRESENTATION = 'push';
export const STACK_FORM_SHEET_PRESENTATION = 'formSheet';
