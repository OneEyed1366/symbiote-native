// Global switches of react-native-screens: feature and compatibility flags, `enableScreens` and
// the platform helpers. Freezing inactive screens is not ported, it is a React Suspense feature

import { BackHandler, Platform } from '@symbiote-native/engine';
import { ANDROID_PLATFORM, IOS_PLATFORM } from './platform-names';

const WINDOWS_PLATFORM = 'windows';

// What downstream navigation libraries check to keep their old behavior against this version
export const compatibilityFlags = {
  isNewBackTitleImplementation: true,
  usesHeaderFlexboxImplementation: true,
  usesNewAndroidHeaderHeightImplementation: true,
  usesStableTabsApi: true,
} as const;

const EXPERIMENT_DEFAULTS = {
  synchronousScreenUpdatesEnabled: true,
  synchronousHeaderConfigUpdatesEnabled: true,
  synchronousHeaderSubviewUpdatesEnabled: true,
  androidLegacyTopInsetBehavior: false,
  androidResetScreenShadowStateOnOrientationChangeEnabled: true,
  iosOrientationInheritanceFixEnabled: true,
};

const STABLE_DEFAULTS = { debugLogging: false };

// Always on in the vendor, kept readable so an app written against the old flags still runs
const RETIRED_EXPERIMENT_FLAGS = [
  'iosPreventReattachmentOfDismissedScreens',
  'iosPreventReattachmentOfDismissedModals',
  'ios26AllowInteractionsDuringTransition',
] as const;

type IRetiredFlag = (typeof RETIRED_EXPERIMENT_FLAGS)[number];

// A flag changed twice means two parts of the app fight over it, so the second change is logged
function createFlags<T extends Record<string, boolean>, R extends string>(
  defaults: T,
  retired: readonly R[],
): T & Record<R, boolean> {
  const values: Record<string, boolean> = { ...defaults };
  const flags: T & Record<R, boolean> = Object.create(null);
  for (const key of Object.keys(defaults)) {
    Object.defineProperty(flags, key, {
      enumerable: true,
      get: () => values[key],
      set: (next: boolean) => {
        if (next !== values[key] && values[key] !== defaults[key]) {
          console.error(
            `[RNScreens] ${key} feature flag modified for a second time; this might lead to unexpected effects`,
          );
        }
        values[key] = next;
      },
    });
  }
  for (const key of retired) {
    Object.defineProperty(flags, key, {
      enumerable: true,
      get: () => true,
      set: () => {},
    });
  }
  return flags;
}

// Most of these can be overridden on a screen, these are the global defaults
export const featureFlags = {
  experiment: createFlags<typeof EXPERIMENT_DEFAULTS, IRetiredFlag>(
    EXPERIMENT_DEFAULTS,
    RETIRED_EXPERIMENT_FLAGS,
  ),
  stable: createFlags(STABLE_DEFAULTS, []),
};

export function isSearchBarAvailableOn(os: string): boolean {
  return os === IOS_PLATFORM || os === ANDROID_PLATFORM;
}

export function isHeaderBarButtonsAvailableOn(os: string): boolean {
  return os === IOS_PLATFORM;
}

const IOS_26_MAJOR_VERSION = 26;

// `version` is a string on iOS, so only its major number is compared
export function isIOS26OrHigherOn(
  os: string,
  version: string | number,
): boolean {
  return (
    os === IOS_PLATFORM && parseInt(String(version), 10) >= IOS_26_MAJOR_VERSION
  );
}

export const isIOS26OrHigherForCurrentPlatform = isIOS26OrHigherOn(
  Platform.OS,
  Platform.Version,
);

export const isAndroidForCurrentPlatform = Platform.OS === ANDROID_PLATFORM;

export const isSearchBarAvailableForCurrentPlatform = isSearchBarAvailableOn(
  Platform.OS,
);

export const isHeaderBarButtonsAvailableForCurrentPlatform =
  isHeaderBarButtonsAvailableOn(Platform.OS);

// The vendor's back press for a screen that lets the system handle it
export function executeNativeBackPress(): boolean {
  BackHandler.exitApp();
  return true;
}

const isNativePlatformSupported =
  Platform.OS === IOS_PLATFORM ||
  Platform.OS === ANDROID_PLATFORM ||
  Platform.OS === WINDOWS_PLATFORM;

let screensAreEnabled = isNativePlatformSupported;

export function enableScreens(shouldEnableScreens = true): void {
  screensAreEnabled = shouldEnableScreens;
}

export function screensEnabled(): boolean {
  return screensAreEnabled;
}
