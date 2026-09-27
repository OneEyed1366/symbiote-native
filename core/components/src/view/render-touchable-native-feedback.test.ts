// TouchableNativeFeedback.canUseNativeForeground, against RN 0.86's TouchableNativeFeedback.js:202:
// `Platform.OS === 'android'` — no API-level check (RN's minSdk already exceeds it).

import { afterEach, describe, expect, it } from 'vitest';
import { Platform } from '@symbiote-native/engine';

import { canUseNativeForeground } from './render-touchable-native-feedback';

const originalOs = Platform.OS;
const originalVersion = Platform.Version;

function setPlatform(os: string, version: unknown): void {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  Object.defineProperty(Platform, 'Version', {
    value: version,
    configurable: true,
  });
}

afterEach(() => setPlatform(originalOs, originalVersion));

describe('canUseNativeForeground (Positive — no throwing path)', () => {
  // why: RN answers from the OS alone.
  it('is true on Android whatever the API level', () => {
    setPlatform('android', 21);
    expect(canUseNativeForeground()).toBe(true);
  });

  // why: the foreground slot does not exist off Android.
  it('is false on iOS', () => {
    setPlatform('ios', '18.0');
    expect(canUseNativeForeground()).toBe(false);
  });
});
