import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SecurityLevel as ISecurityLevel } from './types';

const fakePlatform = { OS: 'ios' as 'ios' | 'android' };

vi.mock('expo-modules-core', () => ({ Platform: fakePlatform }));

const { SecurityLevel } = await import('./types');

// TS gives each enum member its own nominal literal type, even a computed one whose runtime
// value equals another member — widen through this alias so `.toBe()` compares by value.
function readBiometric(): ISecurityLevel {
  return SecurityLevel.BIOMETRIC;
}

afterEach(() => {
  fakePlatform.OS = 'ios';
  vi.restoreAllMocks();
});

// types.ts is otherwise plain data: two enums of constant members and several structural types
// (ILocalAuthenticationOptions/Result/Error, IBiometricsSecurityLevel) with no runtime behavior
// to exercise — see the coverage report for why those are N/A rather than untested. The single
// unit with real logic is the SecurityLevel.BIOMETRIC getter, an upstream deprecation shim that
// re-reads Platform.OS on every access and never throws — there is no Negative group here, only
// the two platform branches of the one computed value.
describe('SecurityLevel.BIOMETRIC (deprecated alias, no throwing path)', () => {
  it('resolves to BIOMETRIC_STRONG on iOS and warns without the Android caveat', () => {
    // why: iOS has no weak-biometric option (per the SecurityLevel.BIOMETRIC_WEAK doc comment),
    // so the deprecated alias must resolve to the strong tier there, and the warning must not
    // mislead an iOS caller with Android-only wording.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(readBiometric()).toBe(SecurityLevel.BIOMETRIC_STRONG);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('has been deprecated'),
    );
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Android'));
  });

  it('resolves to BIOMETRIC_WEAK on Android and warns with the Android caveat', () => {
    // why: Android's default biometric class is weak (2D face unlock etc.) — the alias must
    // follow the platform default, and the warning must call out that this can surprise a
    // caller expecting strong-only matching (the documented reason the getter was deprecated).
    fakePlatform.OS = 'android';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(readBiometric()).toBe(SecurityLevel.BIOMETRIC_WEAK);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('has been deprecated'),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Android'));
  });

  it('re-reads Platform.OS on every access instead of caching the first read', () => {
    // why: the getter is a live shim, not a one-time computed value — an app that only learns
    // its platform after this module has already loaded must still get the right alias.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(readBiometric()).toBe(SecurityLevel.BIOMETRIC_STRONG);

    fakePlatform.OS = 'android';
    expect(readBiometric()).toBe(SecurityLevel.BIOMETRIC_WEAK);
  });
});
