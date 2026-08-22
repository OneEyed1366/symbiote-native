// Co-located unit test: the imperative-action modules (Alert / Linking / Vibration)
// reach the native bridge correctly. A fake __turboModuleProxy captures each native call; native
// module NAMES are NOT verified here: a headless fake answers to any name — this proves only the
// JS path.

import { beforeAll, describe, expect, it } from 'vitest';
import { Alert } from '../alert';
import { Linking } from '../linking';
import { Vibration } from '../vibration';

interface ICapturedAlert {
  title?: string;
  message?: string;
}

let capturedAlert: ICapturedAlert | null = null;
let capturedOpenUrl: string | null = null;
let capturedVibrate: number | null = null;

const fakeModules: Record<string, unknown> = {
  AlertManager: {
    alertWithArgs(args: ICapturedAlert): void {
      capturedAlert = args;
    },
  },
  LinkingManager: {
    openURL(url: string): Promise<void> {
      capturedOpenUrl = url;
      return Promise.resolve();
    },
    canOpenURL(): Promise<boolean> {
      return Promise.resolve(true);
    },
    getInitialURL(): Promise<string | null> {
      return Promise.resolve(null);
    },
    addListener(): void {},
    removeListeners(): void {},
  },
  Vibration: {
    vibrate(pattern: number): void {
      capturedVibrate = pattern;
    },
    vibrateByPattern(): void {},
  },
};

function isType<T>(value: unknown): value is T {
  return typeof value === 'object' && value !== null;
}

beforeAll(() => {
  Object.assign(globalThis, {
    __turboModuleProxy: <T>(name: string): T | null => {
      const found = fakeModules[name];
      return isType<T>(found) ? found : null;
    },
  });
});

// Alert/Linking/Vibration each have their own dedicated branch-level suite elsewhere
// (alert.test.ts, linking.test.ts, vibration.test.ts) that verify the full contract —
// synthesized buttons, URL validation, pattern arrays, etc. This file's only job is the
// one this header already states: prove the JS call genuinely REACHES the resolved
// native module through the shared fake bridge, not the module's own internal branches.
// Every scenario here completes without an error (there is no throwing path to exercise
// at this integration level — a rejected/missing module is that dedicated suite's job) —
// Positive only, no Negative group.
describe('imperative engine modules reach the native bridge', () => {
  // why: Alert's positional-args JS API must ultimately hand the native alert manager
  // the same title/message it was called with — proves the call actually reaches
  // AlertManager rather than resolving to a no-op stub.
  it('Alert.alert -> AlertManager.alertWithArgs', () => {
    Alert.alert('Title here', 'Body here', [{ text: 'OK' }]);
    expect(capturedAlert).not.toBeNull();
    expect(capturedAlert?.title).toBe('Title here');
    expect(capturedAlert?.message).toBe('Body here');
  });

  // why: a deep link opened from JS must reach LinkingManager.openURL with the exact
  // URL string, unmodified — the module that actually hands off to the OS.
  it('Linking.openURL -> LinkingManager.openURL', async () => {
    await Linking.openURL('https://example.com/deep');
    expect(capturedOpenUrl).toBe('https://example.com/deep');
  });

  // why: canOpenURL and getInitialURL are the other two imperative Linking entry
  // points a consumer calls directly (not just openURL) — each must resolve through
  // the same resolved native module, proving the whole public surface reaches it,
  // not only the one method the other scenarios happen to exercise.
  it('Linking.canOpenURL / Linking.getInitialURL reach LinkingManager', async () => {
    await expect(Linking.canOpenURL('https://example.com')).resolves.toBe(true);
    await expect(Linking.getInitialURL()).resolves.toBeNull();
  });

  // why: a haptic pattern in ms must reach the native Vibration module unchanged —
  // the module that actually drives the device motor.
  it('Vibration.vibrate -> Vibration.vibrate', () => {
    Vibration.vibrate(250);
    expect(capturedVibrate).toBe(250);
  });
});
