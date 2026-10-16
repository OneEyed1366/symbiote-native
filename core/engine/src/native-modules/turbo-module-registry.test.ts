// `TurboModuleRegistry.js` of RN: `get` answers null for a module nobody registered, `getEnforcing`
// raises an invariant with RN's own text
import { afterEach, describe, expect, it } from 'vitest';
import { TurboModuleRegistry } from '../index';

afterEach(() => {
  globalThis.nativeModuleProxy = undefined;
});

describe('TurboModuleRegistry.get', () => {
  it('returns the module the host registered', () => {
    const module = { ping: () => 1 };
    globalThis.nativeModuleProxy = { RnParityPing: module };

    expect(TurboModuleRegistry.get('RnParityPing')).toBe(module);
  });

  it('returns null for a module nobody registered', () => {
    expect(TurboModuleRegistry.get('RnParityMissing')).toBeNull();
  });
});

describe('TurboModuleRegistry.getEnforcing', () => {
  it('returns the module the host registered', () => {
    const module = { ping: () => 1 };
    globalThis.nativeModuleProxy = { RnParityPing: module };

    expect(TurboModuleRegistry.getEnforcing('RnParityPing')).toBe(module);
  });

  it("throws RN's invariant for a module nobody registered", () => {
    expect(() => TurboModuleRegistry.getEnforcing('RnParityMissing')).toThrow(
      "TurboModuleRegistry.getEnforcing(...): 'RnParityMissing' could not be found. Verify that a module by this name is registered in the native binary.",
    );
  });
});
