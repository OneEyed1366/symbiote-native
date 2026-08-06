// Hand-ported from .vendors/expo/packages/expo-screen-orientation/src/ScreenOrientation.ts
// (sdk-57). Unlike battery, upstream ScreenOrientation throws UnavailabilityError when the
// native method is absent — same convention as packages/network/src/core/network.ts.
import { Platform, UnavailabilityError, type EventSubscription } from 'expo-modules-core';
import { Dimensions } from 'react-native';
import { expoScreenOrientation, type IPlatformOrientationParam } from './native-module';
import {
  Orientation,
  OrientationLock,
  WebOrientationLock,
  type OrientationChangeEvent,
  type OrientationChangeListener,
  type PlatformOrientationInfo,
} from './types';

const NATIVE_MODULE_NAME = 'ScreenOrientation';

let _orientationChangeSubscribers: EventSubscription[] = [];
let _lastOrientationLock: OrientationLock = OrientationLock.UNKNOWN;

/** Locks the screen to the given orientation. */
export async function lockAsync(orientationLock: OrientationLock): Promise<void> {
  if (!expoScreenOrientation.lockAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'lockAsync');
  }
  const orientationLocks = Object.values(OrientationLock);
  if (!orientationLocks.includes(orientationLock)) {
    throw new TypeError(`Invalid Orientation Lock: ${orientationLock}`);
  }
  if (orientationLock === OrientationLock.OTHER) {
    return;
  }
  await expoScreenOrientation.lockAsync(orientationLock);
  _lastOrientationLock = orientationLock;
}

/** Locks the screen to a platform-specific orientation param — Android constant, iOS
 * orientation array, or web `WebOrientationLock`. */
export async function lockPlatformAsync(options: PlatformOrientationInfo): Promise<void> {
  if (!expoScreenOrientation.lockPlatformAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'lockPlatformAsync');
  }
  const { screenOrientationConstantAndroid, screenOrientationArrayIOS, screenOrientationLockWeb } =
    options;
  let platformOrientationParam: IPlatformOrientationParam | undefined;
  if (Platform.OS === 'android' && screenOrientationConstantAndroid) {
    if (isNaN(screenOrientationConstantAndroid)) {
      throw new TypeError(
        `lockPlatformAsync Android platform: screenOrientationConstantAndroid cannot be called with ${screenOrientationConstantAndroid}`,
      );
    }
    platformOrientationParam = screenOrientationConstantAndroid;
  } else if (Platform.OS === 'ios' && screenOrientationArrayIOS) {
    if (!Array.isArray(screenOrientationArrayIOS)) {
      throw new TypeError(
        `lockPlatformAsync iOS platform: screenOrientationArrayIOS cannot be called with ${screenOrientationArrayIOS}`,
      );
    }
    const orientations = Object.values(Orientation);
    for (const orientation of screenOrientationArrayIOS) {
      if (!orientations.includes(orientation)) {
        throw new TypeError(
          `lockPlatformAsync iOS platform: ${orientation} is not a valid Orientation`,
        );
      }
    }
    platformOrientationParam = screenOrientationArrayIOS;
  } else if (Platform.OS === 'web' && screenOrientationLockWeb) {
    const webOrientationLocks = Object.values(WebOrientationLock);
    if (!webOrientationLocks.includes(screenOrientationLockWeb)) {
      throw new TypeError(`Invalid Web Orientation Lock: ${screenOrientationLockWeb}`);
    }
    platformOrientationParam = screenOrientationLockWeb;
  }
  if (!platformOrientationParam) {
    throw new TypeError('lockPlatformAsync cannot be called with undefined option properties');
  }
  await expoScreenOrientation.lockPlatformAsync(platformOrientationParam);
  _lastOrientationLock = OrientationLock.OTHER;
}

/** Unlocks the screen orientation back to the system default. */
export async function unlockAsync(): Promise<void> {
  if (!expoScreenOrientation.lockAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'lockAsync');
  }
  await expoScreenOrientation.lockAsync(OrientationLock.DEFAULT);
}

/** Gets the device's current screen orientation. */
export async function getOrientationAsync(): Promise<Orientation> {
  if (!expoScreenOrientation.getOrientationAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getOrientationAsync');
  }
  return expoScreenOrientation.getOrientationAsync();
}

/** Gets the current orientation lock, falling back to the last value set via `lockAsync()`/
 * `lockPlatformAsync()` when the native method itself isn't available. */
export async function getOrientationLockAsync(): Promise<OrientationLock> {
  if (!expoScreenOrientation.getOrientationLockAsync) {
    return _lastOrientationLock;
  }
  return expoScreenOrientation.getOrientationLockAsync();
}

/** Gets the current orientation lock as a platform-specific value. */
export async function getPlatformOrientationLockAsync(): Promise<PlatformOrientationInfo> {
  const platformOrientationLock = await expoScreenOrientation.getPlatformOrientationLockAsync?.();
  if (Platform.OS === 'android' && typeof platformOrientationLock === 'number') {
    return { screenOrientationConstantAndroid: platformOrientationLock };
  }
  if (Platform.OS === 'ios' && Array.isArray(platformOrientationLock)) {
    return { screenOrientationArrayIOS: platformOrientationLock };
  }
  if (Platform.OS === 'web' && typeof platformOrientationLock === 'string') {
    return { screenOrientationLockWeb: platformOrientationLock };
  }
  return {};
}

/** Whether the given orientation lock is supported on this device. */
export async function supportsOrientationLockAsync(
  orientationLock: OrientationLock,
): Promise<boolean> {
  if (!expoScreenOrientation.supportsOrientationLockAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'supportsOrientationLockAsync');
  }
  const orientationLocks = Object.values(OrientationLock);
  if (!orientationLocks.includes(orientationLock)) {
    throw new TypeError(`Invalid Orientation Lock: ${orientationLock}`);
  }
  return expoScreenOrientation.supportsOrientationLockAsync(orientationLock);
}

/** Subscribes to orientation-change events. */
export function addOrientationChangeListener(
  listener: OrientationChangeListener,
): EventSubscription {
  if (typeof listener !== 'function') {
    throw new TypeError(`addOrientationChangeListener cannot be called with ${listener}`);
  }
  const subscription = createDidUpdateDimensionsSubscription(listener);
  _orientationChangeSubscribers.push(subscription);
  return subscription;
}

/** Removes every orientation-change listener registered via `addOrientationChangeListener()`. */
export function removeOrientationChangeListeners(): void {
  let i = _orientationChangeSubscribers.length;
  while (i--) {
    _orientationChangeSubscribers[i]?.remove();
    _orientationChangeSubscribers.pop();
  }
}

/** Removes a single orientation-change listener's subscription. */
export function removeOrientationChangeListener(subscription: EventSubscription): void {
  if (!subscription || !subscription.remove) {
    throw new TypeError('Must pass in a valid subscription');
  }
  subscription.remove();
  _orientationChangeSubscribers = _orientationChangeSubscribers.filter(sub => sub !== subscription);
}

// IMPORTANT: Android doesn't emit `expoDidUpdateDimensions` — RN's own Dimensions module does,
// so on Android we piggyback on RN's own `Dimensions.addEventListener('change', ...)` instead.
function createDidUpdateDimensionsSubscription(
  listener: OrientationChangeListener,
): EventSubscription {
  if (Platform.OS === 'web' || Platform.OS === 'ios') {
    return expoScreenOrientation.addListener(
      'expoDidUpdateDimensions',
      async (update: OrientationChangeEvent) => {
        listener(update);
      },
    );
  }
  return Dimensions.addEventListener('change', async () => {
    const [orientationLock, orientation] = await Promise.all([
      getOrientationLockAsync(),
      getOrientationAsync(),
    ]);
    listener({ orientationInfo: { orientation }, orientationLock });
  });
}
