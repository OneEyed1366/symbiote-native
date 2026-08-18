// Unit test for the I18nManager module: it reads the native RTL
// constants eagerly at module load, exposes them via getConstants() and the plain `isRTL` /
// `doLeftAndRightSwapInRTL` fields, and routes the allow/force/swap setters straight to the
// native module. Constants are read at import time, so the fake native module (or its absence)
// must be installed BEFORE each test's fresh import.
//
// I18nManager never throws: an unlinked or malformed native module degrades to RN's
// documented DEFAULT_CONSTANTS, and the setters degrade to a logged no-op. So there
// is no Negative (toThrow) group; every scenario below is Positive.

import { afterEach, describe, expect, it, vi } from 'vitest';

interface INativeCall {
  method: string;
  args: unknown[];
}

let I18nManager: typeof import('./index').I18nManager;

let nativeCalls: INativeCall[];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]): void => {
    nativeCalls.push({ method, args });
  };
}

async function loadWithModule(getConstants: () => unknown): Promise<void> {
  nativeCalls = [];
  const fakeI18nManager = {
    getConstants,
    allowRTL: record('allowRTL'),
    forceRTL: record('forceRTL'),
    swapLeftAndRightInRTL: record('swapLeftAndRightInRTL'),
  };
  globalThis.nativeModuleProxy = { I18nManager: fakeI18nManager };
  vi.resetModules();
  ({ I18nManager } = await import('./index'));
}

async function loadWithoutModule(): Promise<void> {
  nativeCalls = [];
  globalThis.nativeModuleProxy = {};
  vi.resetModules();
  ({ I18nManager } = await import('./index'));
}

afterEach(() => {
  globalThis.nativeModuleProxy = undefined;
});

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

describe('I18nManager', () => {
  describe('with a linked native module', () => {
    // why: RN reads I18nManager's constants eagerly and mirrors them onto plain
    // fields (not just getConstants()) for RN-parity synchronous access.
    it('mirrors the native RTL constants on the plain fields', async () => {
      await loadWithModule(() => ({
        isRTL: true,
        doLeftAndRightSwapInRTL: false,
        localeIdentifier: 'ar-EG',
      }));
      expect(I18nManager.isRTL).toBe(true);
      expect(I18nManager.doLeftAndRightSwapInRTL).toBe(false);
    });

    it('getConstants() returns the native constants including localeIdentifier', async () => {
      await loadWithModule(() => ({
        isRTL: true,
        doLeftAndRightSwapInRTL: false,
        localeIdentifier: 'ar-EG',
      }));
      const constants = I18nManager.getConstants();
      expect(constants.isRTL).toBe(true);
      expect(constants.doLeftAndRightSwapInRTL).toBe(false);
      expect(constants.localeIdentifier).toBe('ar-EG');
    });

    // why: localeIdentifier is documented optional (RN omits it on some hosts) --
    // it must be genuinely absent, not coerced to an empty string or null.
    it('omits localeIdentifier when native does not report one', async () => {
      await loadWithModule(() => ({
        isRTL: false,
        doLeftAndRightSwapInRTL: true,
      }));
      expect(I18nManager.getConstants().localeIdentifier).toBeUndefined();
    });

    it('allowRTL routes to the native module', async () => {
      await loadWithModule(() => ({
        isRTL: false,
        doLeftAndRightSwapInRTL: true,
      }));
      I18nManager.allowRTL(true);
      const calls = callsOf('allowRTL');
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0]).toBe(true);
    });

    it('forceRTL routes to the native module', async () => {
      await loadWithModule(() => ({
        isRTL: false,
        doLeftAndRightSwapInRTL: true,
      }));
      I18nManager.forceRTL(false);
      const calls = callsOf('forceRTL');
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0]).toBe(false);
    });

    it('swapLeftAndRightInRTL routes to the native module', async () => {
      await loadWithModule(() => ({
        isRTL: false,
        doLeftAndRightSwapInRTL: true,
      }));
      I18nManager.swapLeftAndRightInRTL(true);
      const calls = callsOf('swapLeftAndRightInRTL');
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0]).toBe(true);
    });
  });

  describe('readConstants guard (malformed native getConstants())', () => {
    // why: a non-object getConstants() return (a broken/old native module) must not
    // crash module load -- it falls back to RN's documented defaults.
    it('falls back to defaults when getConstants() is not an object', async () => {
      await loadWithModule(() => null);
      expect(I18nManager.isRTL).toBe(false);
      expect(I18nManager.doLeftAndRightSwapInRTL).toBe(true);
    });

    // why: a shape with the wrong field TYPES (not just missing) is just as
    // untrustworthy as a missing shape -- must fall back rather than surface `isRTL`
    // as a non-boolean that would silently break every RTL conditional downstream.
    it('falls back to defaults when isRTL is not a boolean', async () => {
      await loadWithModule(() => ({
        isRTL: 'yes',
        doLeftAndRightSwapInRTL: true,
      }));
      expect(I18nManager.isRTL).toBe(false);
      expect(I18nManager.doLeftAndRightSwapInRTL).toBe(true);
    });

    // why: localeIdentifier is the one OPTIONAL field -- an invalid type for it must
    // not poison the two required booleans, which are still valid and usable.
    it('drops an invalid localeIdentifier without falling back on the valid booleans', async () => {
      await loadWithModule(() => ({
        isRTL: true,
        doLeftAndRightSwapInRTL: false,
        localeIdentifier: 42,
      }));
      expect(I18nManager.isRTL).toBe(true);
      expect(I18nManager.doLeftAndRightSwapInRTL).toBe(false);
      expect(I18nManager.getConstants().localeIdentifier).toBeUndefined();
    });
  });

  describe('without a linked native module', () => {
    // why: a headless run or a binary missing I18nManager must not crash app
    // startup -- RN's documented defaults (not RTL, swap-in-RTL true) apply.
    it('uses the default constants', async () => {
      await loadWithoutModule();
      expect(I18nManager.isRTL).toBe(false);
      expect(I18nManager.doLeftAndRightSwapInRTL).toBe(true);
      expect(I18nManager.getConstants().localeIdentifier).toBeUndefined();
    });

    // why: an app calling allowRTL/forceRTL/swapLeftAndRightInRTL before the native
    // module resolves (or on a host without it) must not crash -- each setter
    // silently no-ops instead.
    it('every setter is a no-op that does not throw', async () => {
      await loadWithoutModule();
      expect(() => I18nManager.allowRTL(true)).not.toThrow();
      expect(() => I18nManager.forceRTL(true)).not.toThrow();
      expect(() => I18nManager.swapLeftAndRightInRTL(true)).not.toThrow();
      expect(nativeCalls).toHaveLength(0);
    });
  });
});
