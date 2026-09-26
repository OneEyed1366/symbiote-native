// Per-native-component event declarations: symbiote's slimmed ViewConfigRegistry. Mirrors RN's
// ViewConfig — each Fabric component declares which event names it can emit — shared by every
// adapter, so it lives here rather than in any one framework adapter.

// Flat-bag adapters (React/Vue/Solid) hand props and handlers mixed together and must split them:
// they consult this registry to tell an event handler (onChange -> change) from a native prop that
// merely looks like one. Structural adapters (Svelte, Angular) deliver events pre-separated.

import { isRegisteredEvent } from './registry';

// Accessibility events from RN's base ViewConfig: every view can emit them.
// accessibilityAction fires on iOS + Android; the other three are iOS-only and inert
// on Android (no native producer), exactly like `scrollToTop` below.
const A11Y_EVENTS: readonly string[] = [
  'accessibilityAction',
  'accessibilityTap',
  'magicTap',
  'accessibilityEscape',
];

// Events every view can emit, from RN's base ViewConfig. press/pressIn/pressOut/longPress are
// synthesized from the touch stream (events.ts); layout is universal; focus/blur are RN's bubbling
// focus events on the base View, so any view can emit them; the accessibility events are base too.
const BASE_EVENTS: readonly string[] = [
  'press',
  'pressIn',
  'pressOut',
  // Must be registered like its four siblings: routeProp hands an on* prop to setEventListener
  // only for a registered event, so an unregistered onPressMove lands in node.props unread.
  'pressMove',
  'longPress',
  'layout',
  'focus',
  'blur',
  ...A11Y_EVENTS,
];

// An event set is platform-invariant: a text input emits `change` on iOS and Android alike, only
// the native component name differs. Each primitive's events are declared once and keyed under
// both platform names — consulted by the resolved name, so only one side is ever live at runtime.
const TEXT_INPUT_EVENTS: readonly string[] = [
  'change',
  'focus',
  'blur',
  'endEditing',
  'submitEditing',
  'keyPress',
  'selectionChange',
  'contentSizeChange',
];
const MODAL_EVENTS: readonly string[] = [
  'show',
  'dismiss',
  'requestClose',
  'orientationChange',
];

// A scroll view's events are the same on both axes and both platforms; only the native name
// differs (Android RCTScrollView vertical vs AndroidHorizontalScrollView horizontal). Declared
// once, keyed under each name below — same shape as the text-input keys above.
const SCROLL_EVENTS: readonly string[] = [
  'scroll',
  'scrollBeginDrag',
  'scrollEndDrag',
  'momentumScrollBegin',
  'momentumScrollEnd',
  'contentSizeChange',
  // iOS-only: emitted when the user taps the status bar to scroll to top. Inert on
  // Android (no native producer), so keying it here is harmless cross-platform.
  'scrollToTop',
];

// Text emits a glyph-layout event (onTextLayout) beyond the base press/layout set.
const TEXT_EVENTS: readonly string[] = ['textLayout'];

// Fabric component name -> the events it emits beyond the base set. The keys match
// SymbioteNode.component (what createNode is called with). A component absent here
// still gets BASE_EVENTS, so a new primitive has working press/layout for free.
const COMPONENT_EVENTS: Readonly<Record<string, readonly string[]>> = {
  RCTImageView: [
    'loadStart',
    'load',
    'loadEnd',
    'error',
    'progress',
    'partialLoad',
  ],
  RCTScrollView: SCROLL_EVENTS,
  AndroidHorizontalScrollView: SCROLL_EVENTS,
  RCTSinglelineTextInputView: TEXT_INPUT_EVENTS,
  RCTMultilineTextInputView: TEXT_INPUT_EVENTS,
  AndroidTextInput: TEXT_INPUT_EVENTS,
  RCTText: TEXT_EVENTS,
  Switch: ['change'],
  AndroidSwitch: ['change'],
  ModalHostView: MODAL_EVENTS,
  RCTModalHostView: MODAL_EVENTS,
  PullToRefreshView: ['refresh'],
  AndroidSwipeRefreshLayout: ['refresh'],
};

const configCache = new Map<string, ReadonlySet<string>>();

// The built-in event names `component` can emit (its own + the base set). Cached;
// the registry layer is consulted live in isEventFor so a later registration is
// never masked by a stale cache entry.
function eventNamesFor(component: string): ReadonlySet<string> {
  let set = configCache.get(component);
  if (set === undefined) {
    set = new Set([...BASE_EVENTS, ...(COMPONENT_EVENTS[component] ?? [])]);
    configCache.set(component, set);
  }
  return set;
}

// True when `listenerName` is an event `component` emits, false when it is an
// ordinary native prop. This is the single authority for the event-vs-prop split:
// the name alone never decides. Built-ins first, then any third-party registration.
export function isEventFor(component: string, listenerName: string): boolean {
  if (eventNamesFor(component).has(listenerName)) return true;
  return isRegisteredEvent(component, listenerName);
}
