import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GRANTED_PERMISSION = {
  status: 'granted',
  expires: 'never',
  granted: true,
  canAskAgain: true,
};

const FAKE_EXPO_AUDIO = {
  setIsAudioActiveAsync: vi.fn(async () => undefined),
  setAudioModeAsync: vi.fn(async () => undefined),
  requestRecordingPermissionsAsync: vi.fn(async () => GRANTED_PERMISSION),
  requestNotificationPermissionsAsync: vi.fn(async () => GRANTED_PERMISSION),
  getRecordingPermissionsAsync: vi.fn(async () => GRANTED_PERMISSION),
  preload: vi.fn(async () => undefined),
  clearPreloadedSource: vi.fn(async () => undefined),
  clearAllPreloadedSources: vi.fn(async () => undefined),
  getPreloadedSources: vi.fn(async () => ['a.mp3']),
};

// The real ExpoAudio native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, same pattern
// packages/task-manager/src/core/task-manager.test.ts and packages/local-auth's
// local-authentication.test.ts use.
vi.mock('./native-module', () => ({ expoAudio: FAKE_EXPO_AUDIO }));

// resolve-source.ts imports the real @symbiote-native/asset, whose Asset.ts pulls in RN's
// Flow-typed resolveAssetSource — same fake every core test importing it uses (see
// packages/font/src/core/font-loader.test.ts).
class FakeAsset {
  name = '';
  uri = '';
  localUri: string | null = null;
  downloadAsync = vi.fn(async () => {});
}
vi.mock('@symbiote-native/asset', () => ({
  Asset: Object.assign(FakeAsset, {
    fromURI: vi.fn(() => new FakeAsset()),
    fromModule: vi.fn(() => new FakeAsset()),
  }),
}));

const mockPlatform = { OS: 'ios' as 'ios' | 'android' };
vi.mock('expo-modules-core', () => ({ Platform: mockPlatform }));

const {
  setIsAudioActiveAsync,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  requestNotificationPermissionsAsync,
  getRecordingPermissionsAsync,
  preload,
  clearPreloadedSource,
  clearAllPreloadedSources,
  getPreloadedSources,
} = await import('./audio-module');

beforeEach(() => {
  mockPlatform.OS = 'ios';
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('setIsAudioActiveAsync / getRecordingPermissionsAsync / requestRecordingPermissionsAsync', () => {
  it('delegate straight to native', async () => {
    await setIsAudioActiveAsync(false);
    expect(FAKE_EXPO_AUDIO.setIsAudioActiveAsync).toHaveBeenCalledWith(false);

    await expect(getRecordingPermissionsAsync()).resolves.toEqual(
      GRANTED_PERMISSION,
    );
    await expect(requestRecordingPermissionsAsync()).resolves.toEqual(
      GRANTED_PERMISSION,
    );
  });
});

describe('setAudioModeAsync', () => {
  it('forwards the mode object unchanged on iOS', async () => {
    mockPlatform.OS = 'ios';
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    expect(FAKE_EXPO_AUDIO.setAudioModeAsync).toHaveBeenCalledWith({
      playsInSilentMode: true,
      allowsRecording: true,
    });
  });

  it('drops iOS-only fields (allowsRecording) on Android', async () => {
    mockPlatform.OS = 'android';
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      shouldPlayInBackground: true,
    });
    expect(FAKE_EXPO_AUDIO.setAudioModeAsync).toHaveBeenCalledWith({
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: undefined,
      interruptionMode: undefined,
      allowsBackgroundRecording: undefined,
      playsInSilentMode: true,
    });
  });
});

describe('requestNotificationPermissionsAsync', () => {
  it('delegates to native on Android', async () => {
    mockPlatform.OS = 'android';
    await expect(requestNotificationPermissionsAsync()).resolves.toEqual(
      GRANTED_PERMISSION,
    );
    expect(
      FAKE_EXPO_AUDIO.requestNotificationPermissionsAsync,
    ).toHaveBeenCalledTimes(1);
  });

  it('rejects on iOS without calling through — error path', async () => {
    mockPlatform.OS = 'ios';
    await expect(requestNotificationPermissionsAsync()).rejects.toThrow(
      'expo-audio: `requestNotificationPermissionsAsync` is only available on Android.',
    );
    expect(
      FAKE_EXPO_AUDIO.requestNotificationPermissionsAsync,
    ).not.toHaveBeenCalled();
  });
});

describe('preload / clearPreloadedSource', () => {
  it('resolves the source and applies the default buffer duration', async () => {
    await preload('a.mp3');
    expect(FAKE_EXPO_AUDIO.preload).toHaveBeenCalledWith({ uri: 'a.mp3' }, 10);
  });

  it('honors an explicit preferredForwardBufferDuration', async () => {
    await preload('a.mp3', { preferredForwardBufferDuration: 30 });
    expect(FAKE_EXPO_AUDIO.preload).toHaveBeenCalledWith({ uri: 'a.mp3' }, 30);
  });

  it('no-ops on a null source without calling through', async () => {
    await preload(null);
    await clearPreloadedSource(null);
    expect(FAKE_EXPO_AUDIO.preload).not.toHaveBeenCalled();
    expect(FAKE_EXPO_AUDIO.clearPreloadedSource).not.toHaveBeenCalled();
  });

  it('clearPreloadedSource resolves the source before delegating', async () => {
    await clearPreloadedSource('a.mp3');
    expect(FAKE_EXPO_AUDIO.clearPreloadedSource).toHaveBeenCalledWith({
      uri: 'a.mp3',
    });
  });
});

describe('clearAllPreloadedSources / getPreloadedSources', () => {
  it('delegate straight to native', async () => {
    await clearAllPreloadedSources();
    expect(FAKE_EXPO_AUDIO.clearAllPreloadedSources).toHaveBeenCalledTimes(1);

    await expect(getPreloadedSources()).resolves.toEqual(['a.mp3']);
  });
});
