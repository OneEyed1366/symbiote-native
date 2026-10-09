// Keyboard over the `KeyboardObserver` native module, a copy of RN's `Keyboard.js`
// TODO(rn-port): `dismiss` needs RN's `dismissKeyboard`, which reaches React's renderer
// So the whole module stays ours until that one call has a renderer-free path

import { createDeviceEventModule } from '../native-modules';
import {
  type IEventEmitterModule,
  type IEventSubscription,
  type INativeEventListener,
} from '../native-events';
import { dlog } from '../debug';
import { Platform } from '../platform';
import { blurTextInput, currentlyFocusedInput } from '../text-input-state';
import { coerceLayoutAnimationType } from '../layout-animation';
import { LayoutAnimation } from '../react-native-host';

// The native module name RN registers the keyboard observer under, confirmed
// from its spec (specs_DEPRECATED/modules/INativeKeyboardObserver.js:20,
// `TurboModuleRegistry.get('KeyboardObserver')`).
const KEYBOARD_OBSERVER_MODULE = 'KeyboardObserver';

// The keyboard notification names native emits. RN's KeyboardEventDefinitions.
export const KEYBOARD_EVENT = {
  willShow: 'keyboardWillShow',
  didShow: 'keyboardDidShow',
  willHide: 'keyboardWillHide',
  didHide: 'keyboardDidHide',
  willChangeFrame: 'keyboardWillChangeFrame',
  didChangeFrame: 'keyboardDidChangeFrame',
} as const;

export type IKeyboardEventName =
  (typeof KEYBOARD_EVENT)[keyof typeof KEYBOARD_EVENT];

// The soft-keyboard frame in screen coordinates. RN's IKeyboardMetrics: the shape
// carried by a IKeyboardEvent's endCoordinates (and iOS startCoordinates).
export type IKeyboardMetrics = {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
};

// The payload native delivers with each keyboard notification. RN's IKeyboardEvent;
// the iOS-only fields (startCoordinates / isEventFromThisApp) are optional so the one
// type covers both platforms. The consumer narrows beyond endCoordinates as needed.
export type IKeyboardEvent = {
  duration: number;
  easing: string;
  endCoordinates: IKeyboardMetrics;
  startCoordinates?: IKeyboardMetrics;
  isEventFromThisApp?: boolean;
};

function isKeyboardEvent(payload: unknown): payload is IKeyboardEvent {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'endCoordinates' in payload &&
    typeof payload.endCoordinates === 'object' &&
    payload.endCoordinates !== null
  );
}

// The KeyboardObserver native module. Its only methods are the observe-counters
// (so native starts/stops watching the keyboard as JS subscribes); it satisfies
// EventEmitterModule. The spec carries no dismiss() (RN dismisses via a separate
// utility), so dismiss() here is a no-op for the first cut (see Keyboard.dismiss).
type INativeKeyboardObserver = IEventEmitterModule & {
  addListener(eventType: string): void;
  removeListeners(count: number): void;
};

// The latest keyboardDidShow event, or null when the keyboard is hidden. RN's
// `_currentlyShowing`. Kept fresh by an internal self-subscription (see getEmitter):
// Keyboard listens to its OWN show/hide events and caches the event so the synchronous
// isVisible() / metrics() reads need no native round-trip.
let currentlyShowing: IKeyboardEvent | null = null;

// Resolved lazily so importing this module has no native side effect, null when not linked

// Keyboard caches the latest show event and clears it on hide, as RN's constructor does
// So `isVisible` and `metrics` read synchronously, with no native round-trip
const deviceEventModule = createDeviceEventModule<INativeKeyboardObserver>({
  moduleName: KEYBOARD_OBSERVER_MODULE,
  moduleLogPrefix: 'Keyboard: KeyboardObserver module',
  // RN hands the module to the emitter on iOS only
  bindModuleToEmitter: Platform.select({ ios: true, default: false }),
  onEmitterCreated: emitter => {
    emitter.addListener(KEYBOARD_EVENT.didShow, payload => {
      if (isKeyboardEvent(payload)) currentlyShowing = payload;
    });
    emitter.addListener(KEYBOARD_EVENT.didHide, () => {
      currentlyShowing = null;
    });
  },
});

// RN builds KeyboardImpl, and with it the didShow/didHide tracking, the first time Keyboard is
// touched. Every method goes through here so the tracking starts at that same moment.
function getEmitter() {
  return deviceEventModule.getEmitter();
}

export const Keyboard = {
  addListener(
    eventType: IKeyboardEventName,
    listener: INativeEventListener,
  ): IEventSubscription {
    dlog(`Keyboard.addListener -> ${eventType}`);
    return getEmitter().addListener(eventType, listener);
  },

  // RN's `_emitter.removeAllListeners(eventType)`: every listener of the event on the device bus,
  // Keyboard's own show/hide tracking included — a later show is then no longer cached.
  removeAllListeners(eventType: IKeyboardEventName): void {
    dlog(`Keyboard.removeAllListeners -> ${eventType}`);
    getEmitter().removeAllListeners(eventType);
  },

  // Whether the keyboard is last known to be visible. Reads the cached show event.
  isVisible(): boolean {
    getEmitter();
    return currentlyShowing !== null;
  },

  // The soft-keyboard frame if visible (the cached event's endCoordinates), else
  // undefined. RN's metrics().
  metrics(): IKeyboardMetrics | undefined {
    getEmitter();
    return currentlyShowing?.endCoordinates;
  },

  // Syncs an accessory view's layout with the keyboard transition: configure the next
  // commit to animate over the keyboard's own duration/easing. RN's
  // scheduleLayoutAnimation (Keyboard.js:193): only when `duration != null && duration !== 0`.
  scheduleLayoutAnimation(event: IKeyboardEvent): void {
    getEmitter();
    const { duration, easing } = event;
    if (duration == null || duration === 0) return;
    dlog(
      `Keyboard.scheduleLayoutAnimation -> duration ${duration}, easing ${easing}`,
    );
    LayoutAnimation.configureNext({
      duration,
      update: { duration, type: coerceLayoutAnimationType(easing) },
    });
  },

  // RN's dismissKeyboard blurs the currently-focused input (TextInputState); blurring
  // an input is what actually retracts the keyboard, so we do the same. A no-op when
  // nothing holds focus, like RN.
  dismiss(): void {
    const focused = currentlyFocusedInput();
    dlog(
      `Keyboard.dismiss -> ${focused ? 'blur focused input' : 'no focused input (no-op)'}`,
    );
    blurTextInput(focused);
  },
};
