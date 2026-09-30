// Raw Fabric event name -> listener name, and the synthesized names that have no raw event at all.
// Kept apart from the handler so the file holding the strings is not the file read while debugging
// a gesture

// Bubbling events walk target -> root, direct ones fire on the target alone. `press` is synthesized
// from a touch sequence and `layout` is direct, so neither is in these tables
export const BUBBLING_EVENTS: Readonly<Record<string, string>> = {
  topFocus: 'focus',
  topBlur: 'blur',
  topChange: 'change',
  topEndEditing: 'endEditing',
  topSubmitEditing: 'submitEditing',
  topKeyPress: 'keyPress',
};

export const DIRECT_EVENTS: Readonly<Record<string, string>> = {
  topLayout: 'layout',
  topScroll: 'scroll',
  topScrollBeginDrag: 'scrollBeginDrag',
  topScrollEndDrag: 'scrollEndDrag',
  topMomentumScrollBegin: 'momentumScrollBegin',
  topMomentumScrollEnd: 'momentumScrollEnd',
  topSelectionChange: 'selectionChange',
  topContentSizeChange: 'contentSizeChange',
  topLoadStart: 'loadStart',
  topLoad: 'load',
  topLoadEnd: 'loadEnd',
  topError: 'error',
  topProgress: 'progress',
  topPartialLoad: 'partialLoad',
  topRefresh: 'refresh',
  topShow: 'show',
  topRequestClose: 'requestClose',
  topDismiss: 'dismiss',
  topOrientationChange: 'orientationChange',
  topTextLayout: 'textLayout',
  topScrollToTop: 'scrollToTop',
  // From RN's base ViewConfig, so any view may emit them. `accessibilityAction` fires on both
  // platforms; the other three have no Android producer and are inert there
  topAccessibilityAction: 'accessibilityAction',
  topAccessibilityTap: 'accessibilityTap',
  topMagicTap: 'magicTap',
  topAccessibilityEscape: 'accessibilityEscape',
};

export const TOUCH_START = 'topTouchStart';
export const TOUCH_MOVE = 'topTouchMove';
export const TOUCH_END = 'topTouchEnd';
export const TOUCH_CANCEL = 'topTouchCancel';
export const PRESS = 'press';

// The responder protocol (PanResponder / Touchable), post-`on` names: `onResponderMove` is
// `responderMove` here. RN's negotiation and its two-phase walk live in `./responder`
export const RESPONDER_GRANT = 'responderGrant';
export const RESPONDER_REJECT = 'responderReject';
export const RESPONDER_START = 'responderStart';
export const RESPONDER_MOVE = 'responderMove';
export const RESPONDER_END = 'responderEnd';
export const RESPONDER_RELEASE = 'responderRelease';
export const RESPONDER_TERMINATE = 'responderTerminate';
export const RESPONDER_TERMINATION_REQUEST = 'responderTerminationRequest';

// The should-set pair asked per phase, as one table т.к. the only thing separating a start
// negotiation from a move one is which two names get asked
export const SHOULD_SET_NAMES: Readonly<
  Record<
    'start' | 'move',
    { readonly capture: string; readonly bubble: string }
  >
> = {
  start: {
    capture: 'startShouldSetResponderCapture',
    bubble: 'startShouldSetResponder',
  },
  move: {
    capture: 'moveShouldSetResponderCapture',
    bubble: 'moveShouldSetResponder',
  },
};

// Synthesized alongside `press` so a Pressable can paint its pressed state. Both fire on the node
// the touch STARTED on, `pressOut` on end and on cancel
export const PRESS_IN = 'pressIn';
export const PRESS_OUT = 'pressOut';

// Synthesized from a sustained hold, so a bare Text or View gets `onLongPress` with no native
// event behind it. A fired long press suppresses the tap on release
export const LONG_PRESS = 'longPress';
export const DEFAULT_LONG_PRESS_MS = 500;

// How far the touch may drift before the pending long press is cancelled
// (`Pressability.DEFAULT_LONG_PRESS_DEACTIVATION_DISTANCE`)
export const LONG_PRESS_DEACTIVATION_DISTANCE = 10;
