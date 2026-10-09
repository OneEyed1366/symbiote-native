// AccessibilityInfo on iOS over the `AccessibilityManager` native module, Metro picks this file
// TODO(rn-port): a copy of RN's iOS branches, RN's module imports `RendererProxy` for
// `sendAccessibilityEvent`, which loads React's renderer, so a non-React adapter cannot use it

import { createDeviceEventModule } from '../native-modules';
import {
  type IEventEmitterModule,
  type IEventSubscription,
} from '../native-events';
import { dlog } from '../debug';
import {
  isBoolean,
  routeSendAccessibilityEvent,
  type IAccessibilityAnnouncementFinishedEvent,
  type IAccessibilityChangeEventName,
  type IAccessibilityChangeEventHandler,
  type IAccessibilityInfoStatic,
  type IAnnounceForAccessibilityOptions,
  type IAccessibilityEventType,
  type IAccessibilityHandle,
} from './shared';
export type {
  IAccessibilityChangeEvent,
  IAccessibilityChangeEventName,
  IAccessibilityChangeEventHandler,
  IAccessibilityAnnouncementFinishedEvent,
  IAnnounceForAccessibilityOptions,
  IAccessibilityEventType,
} from './shared';

// The iOS native module name RN registers this under. NOTE: this is the name the iOS JS
// wrapper (INativeAccessibilityManagerIOS) resolves via
// `TurboModuleRegistry.get('AccessibilityManager')`, NOT the spec filename
// `NativeAccessibilityManager`. A module name is only provable on a real host (a headless
// fake answers to any name); this iOS name is device-verified (the pre-split file shipped it).
const ACCESSIBILITY_MODULE = 'AccessibilityManager';

// Public event name -> the iOS device event the native side emits. iOS keeps the names
// 1:1; the indirection exists only so the mapping stays explicit (Android renames them).
const IOS_DEVICE_EVENT: Partial<Record<IAccessibilityChangeEventName, string>> =
  {
    // RN's deprecated alias (AccessibilityInfo.js EventNames).
    change: 'screenReaderChanged',
    screenReaderChanged: 'screenReaderChanged',
    reduceMotionChanged: 'reduceMotionChanged',
    boldTextChanged: 'boldTextChanged',
    grayscaleChanged: 'grayscaleChanged',
    invertColorsChanged: 'invertColorsChanged',
    reduceTransparencyChanged: 'reduceTransparencyChanged',
    darkerSystemColorsChanged: 'darkerSystemColorsChanged',
    announcementFinished: 'announcementFinished',
  };

type IStateCallback = (enabled: boolean) => void;
type IErrorCallback = (error: unknown) => void;

// The iOS AccessibilityManager native module: callback-based state getters, announce /
// focus side effects, plus the observe-counters. announceForAccessibilityWithOptions is
// optional; older hosts only have the plain announce.
type INativeAccessibilityManagerIOS = IEventEmitterModule & {
  getCurrentVoiceOverState(
    onSuccess: IStateCallback,
    onError: IErrorCallback,
  ): void;
  getCurrentReduceMotionState(
    onSuccess: IStateCallback,
    onError: IErrorCallback,
  ): void;
  getCurrentBoldTextState(
    onSuccess: IStateCallback,
    onError: IErrorCallback,
  ): void;
  getCurrentGrayscaleState(
    onSuccess: IStateCallback,
    onError: IErrorCallback,
  ): void;
  getCurrentInvertColorsState(
    onSuccess: IStateCallback,
    onError: IErrorCallback,
  ): void;
  getCurrentReduceTransparencyState(
    onSuccess: IStateCallback,
    onError: IErrorCallback,
  ): void;
  getCurrentDarkerSystemColorsState?(
    onSuccess: IStateCallback,
    onError: IErrorCallback,
  ): void;
  getCurrentPrefersCrossFadeTransitionsState?(
    onSuccess: IStateCallback,
    onError: IErrorCallback,
  ): void;
  announceForAccessibility(announcement: string): void;
  announceForAccessibilityWithOptions?(
    announcement: string,
    options: IAnnounceForAccessibilityOptions,
  ): void;
  setAccessibilityFocus(reactTag: number): void;
  addListener(eventType: string): void;
  removeListeners(count: number): void;
};

// Lazily resolved so importing this module has no native side effect: a headless run
// without a fake __turboModuleProxy still loads it; resolution happens on first use.
// `null` when the module isn't linked. The lazy-resolve + lazy-emitter shape itself
// lives in `createDeviceEventModule` (native-modules.ts); iOS adds no self-subscription
// on top of it, unlike app-state/appearance/back-handler/keyboard.
const deviceEventModule =
  createDeviceEventModule<INativeAccessibilityManagerIOS>({
    moduleName: ACCESSIBILITY_MODULE,
    moduleLogPrefix: 'AccessibilityInfo(ios): module',
    // RN subscribes on the device bus directly, never through the module's observe counters
    bindModuleToEmitter: false,
  });

function getModule(): INativeAccessibilityManagerIOS | null {
  return deviceEventModule.getModule();
}

function getEmitter() {
  return deviceEventModule.getEmitter();
}

const MANAGER_MISSING = 'NativeAccessibilityManagerIOS is not available';
const SERVICE_ANDROID_ONLY =
  'isAccessibilityServiceEnabled is only available on Android';

// Отклоняем с `missing`, если нет модуля или геттера, как RN, текст у каждого запроса свой
function queryState(
  pick: (
    module: INativeAccessibilityManagerIOS,
  ) => ((s: IStateCallback, e: IErrorCallback) => void) | undefined,
  missing: string,
): Promise<boolean> {
  const module = getModule();
  const getter = module === null ? undefined : pick(module);
  if (module === null || getter === undefined) {
    dlog(`AccessibilityInfo(ios) -> rejected: ${missing}`);
    return Promise.reject(new Error(missing));
  }
  return new Promise((resolve, reject) => {
    getter.call(
      module,
      enabled => resolve(enabled),
      error => reject(error),
    );
  });
}

class AccessibilityInfoIOS implements IAccessibilityInfoStatic {
  isScreenReaderEnabled(): Promise<boolean> {
    return queryState(m => m.getCurrentVoiceOverState, MANAGER_MISSING);
  }

  isReduceMotionEnabled(): Promise<boolean> {
    return queryState(m => m.getCurrentReduceMotionState, MANAGER_MISSING);
  }

  isBoldTextEnabled(): Promise<boolean> {
    return queryState(m => m.getCurrentBoldTextState, MANAGER_MISSING);
  }

  isGrayscaleEnabled(): Promise<boolean> {
    return queryState(m => m.getCurrentGrayscaleState, MANAGER_MISSING);
  }

  isInvertColorsEnabled(): Promise<boolean> {
    return queryState(m => m.getCurrentInvertColorsState, MANAGER_MISSING);
  }

  isReduceTransparencyEnabled(): Promise<boolean> {
    return queryState(
      m => m.getCurrentReduceTransparencyState,
      MANAGER_MISSING,
    );
  }

  // "Increase Contrast" в настройках экрана iOS
  isDarkerSystemColorsEnabled(): Promise<boolean> {
    return queryState(
      m => m.getCurrentDarkerSystemColorsState,
      'NativeAccessibilityManagerIOS.getCurrentDarkerSystemColorsState is not available',
    );
  }

  // Подпункт reduce motion: cross-fade вместо слайда
  prefersCrossFadeTransitions(): Promise<boolean> {
    return queryState(
      m => m.getCurrentPrefersCrossFadeTransitionsState,
      'NativeAccessibilityManagerIOS.getCurrentPrefersCrossFadeTransitionsState is not available',
    );
  }

  // Только Android, на iOS такой настройки нет
  isHighTextContrastEnabled(): Promise<boolean> {
    return Promise.resolve(false);
  }

  isAccessibilityServiceEnabled(): Promise<boolean> {
    return Promise.reject(new Error(SERVICE_ANDROID_ONLY));
  }

  // Post a string to be announced by the screen reader. No-op without a module.
  announceForAccessibility(announcement: string): void {
    const module = getModule();
    if (module === null) {
      dlog(
        'AccessibilityInfo(ios).announceForAccessibility -> no module (no-op)',
      );
      return;
    }
    module.announceForAccessibility(announcement);
  }

  // Announce with queue/priority options. Falls back to the plain announce when the host
  // lacks the options-aware method (older iOS), mirroring RN.
  announceForAccessibilityWithOptions(
    announcement: string,
    options: IAnnounceForAccessibilityOptions,
  ): void {
    const module = getModule();
    if (module === null) {
      dlog(
        'AccessibilityInfo(ios).announceForAccessibilityWithOptions -> no module (no-op)',
      );
      return;
    }
    if (module.announceForAccessibilityWithOptions) {
      module.announceForAccessibilityWithOptions(announcement, options);
    } else {
      module.announceForAccessibility(announcement);
    }
  }

  // Move accessibility focus to the view with the given react tag. No-op without a module.
  // RN deprecates this in favor of sendAccessibilityEvent; kept for parity.
  setAccessibilityFocus(reactTag: number): void {
    const module = getModule();
    if (module === null) {
      dlog('AccessibilityInfo(ios).setAccessibilityFocus -> no module (no-op)');
      return;
    }
    dlog(`AccessibilityInfo(ios).setAccessibilityFocus -> ${reactTag}`);
    module.setAccessibilityFocus(reactTag);
  }

  // iOS has no recommended-timeout query; resolve the original (RN parity).
  getRecommendedTimeoutMillis(originalTimeout: number): Promise<number> {
    return Promise.resolve(originalTimeout);
  }

  // Emit an accessibility event at a view through the Fabric slot. The shared routing
  // (isSymbioteNode guard + dispatch) lives in shared.ts, identical on both platforms;
  // the ONE thing iOS adds is its own early return on 'click' (VoiceOver has no click
  // producer, AccessibilityInfo.js), passed as the shouldSkip hook so it keeps its
  // exact log text.
  sendAccessibilityEvent(
    handle: IAccessibilityHandle,
    eventType: IAccessibilityEventType,
  ): void {
    routeSendAccessibilityEvent('ios', handle, eventType, () => {
      if (eventType !== 'click') return false;
      dlog(
        'AccessibilityInfo(ios).sendAccessibilityEvent("click") -> iOS no-op (RN parity)',
      );
      return true;
    });
  }

  // Subscribe to an accessibility-state change. A handler for a boolean event receives a
  // boolean; the iOS-only `announcementFinished` carries the announcement payload. Never
  // throws: a public event with no iOS device mapping yields an inert subscription, and a
  // missing module yields a live-but-silent one (the counters are no-ops without a module).
  addEventListener(
    eventName: IAccessibilityChangeEventName,
    handler: IAccessibilityChangeEventHandler,
  ): IEventSubscription {
    const deviceEvent = IOS_DEVICE_EVENT[eventName];
    dlog(
      `AccessibilityInfo(ios).addEventListener -> ${eventName} (device: ${deviceEvent ?? 'none'})`,
    );
    if (deviceEvent === undefined) {
      return { remove(): void {} };
    }
    const eventEmitter = getEmitter();
    return eventEmitter.addListener(deviceEvent, payload => {
      // Most events carry a bare boolean; announcementFinished carries an object. Forward
      // each in its own shape, dropping payloads that match neither so we never forward
      // garbage to the handler.
      if (eventName === 'announcementFinished') {
        if (isAnnouncementFinished(payload)) handler(payload);
        return;
      }
      if (!isBoolean(payload)) return;
      handler(payload);
    });
  }
}

function isAnnouncementFinished(
  payload: unknown,
): payload is IAccessibilityAnnouncementFinishedEvent {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'announcement' in payload &&
    typeof payload.announcement === 'string' &&
    'success' in payload &&
    typeof payload.success === 'boolean'
  );
}

export const AccessibilityInfo: IAccessibilityInfoStatic =
  new AccessibilityInfoIOS();
