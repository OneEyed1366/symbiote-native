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

describe('SecurityLevel.BIOMETRIC', () => {
  it('aliases to BIOMETRIC_STRONG on iOS and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(readBiometric()).toBe(SecurityLevel.BIOMETRIC_STRONG);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('aliases to BIOMETRIC_WEAK on Android and warns', () => {
    fakePlatform.OS = 'android';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(readBiometric()).toBe(SecurityLevel.BIOMETRIC_WEAK);
    expect(warn).toHaveBeenCalledOnce();
  });
});
