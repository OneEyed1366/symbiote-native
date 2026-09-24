// Ported from expo-asset/src/__tests__/LocalAssets-test.native.ts (sdk-57) — getLocalAssetUri
// reads ExpoUpdates.localAssets via platform-utils.ts's requireOptionalNativeModule lookup,
// snapshotted once at module load (matching upstream's own top-level `const localAssets = ...`).
import { describe, expect, it, vi } from 'vitest';

const FAKE_LOCAL_ASSETS = {
  'test3.png': 'file:///Expo.app/asset_test3.png',
  'test4.': 'file:///Expo.app/asset_test4',
  'file-hash': 'file:///Expo.app/file-hash',
};

vi.mock('expo-modules-core', () => ({
  requireNativeModule: () => {
    throw new Error('ExpoGo native module not present');
  },
  requireOptionalNativeModule: (name: string) =>
    name === 'ExpoUpdates'
      ? { isEnabled: true, localAssets: FAKE_LOCAL_ASSETS }
      : undefined,
}));
vi.mock('expo-constants', () => ({
  default: { experienceUrl: undefined, __unsafeNoWarnManifest2: undefined },
}));

const { getLocalAssetUri } = await import('./local-assets');

describe('getLocalAssetUri (Positive)', () => {
  it('returns the URI for a bundled asset matched by hash+extension', () => {
    expect(getLocalAssetUri('test3', 'png')).toBe(
      'file:///Expo.app/asset_test3.png',
    );
  });

  it('returns the same URI whether or not a file extension is given for a hash-only entry', () => {
    expect(getLocalAssetUri('file-hash', 'jpg')).toBe(
      'file:///Expo.app/file-hash',
    );
    expect(getLocalAssetUri('file-hash', null)).toBe(
      'file:///Expo.app/file-hash',
    );
  });

  it('matches an entry keyed by hash+empty extension when type is null', () => {
    expect(getLocalAssetUri('test4', null)).toBe(
      'file:///Expo.app/asset_test4',
    );
  });
});

describe('getLocalAssetUri (Negative — no matching entry)', () => {
  it('returns null when no asset exists for the given hash and type', () => {
    expect(getLocalAssetUri('test1', 'png')).toBeNull();
    expect(getLocalAssetUri('test2', 'xxx')).toBeNull();
  });
});
