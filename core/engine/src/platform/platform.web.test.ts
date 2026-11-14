// The web `Platform` answers from its filename alone, so nothing here may read the native bridge
// `native` in a select spec means iOS and Android, so it never applies on web

import { afterEach, describe, expect, it } from 'vitest';
import { Platform } from './index.web';

const TESTING_CONSTANTS = { isTesting: true, interfaceIdiom: 'pad' };

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'nativeModuleProxy');
});

describe('Platform (web)', () => {
  it("OS is the static 'web'", () => {
    expect(Platform.OS).toBe('web');
  });

  describe('select', () => {
    it('picks the web branch', () => {
      expect(Platform.select({ web: 'W', ios: 'I', android: 'A' })).toBe('W');
    });

    it('ignores the native branch, which covers only iOS and Android', () => {
      expect(Platform.select({ native: 'N', default: 'D' })).toBe('D');
    });

    it('lets an explicit undefined under web win over default', () => {
      expect(Platform.select({ web: undefined, default: 'D' })).toBeUndefined();
    });

    it('resolves to undefined when no key matches', () => {
      expect(Platform.select({ ios: 'I', android: 'A' })).toBeUndefined();
    });
  });

  describe('device facts', () => {
    it('reports no device class, no testing flag and no version', () => {
      expect(Platform.isPad).toBe(false);
      expect(Platform.isTV).toBe(false);
      expect(Platform.isVision).toBe(false);
      expect(Platform.isMacCatalyst).toBe(false);
      expect(Platform.isTesting).toBe(false);
      expect(Platform.isDisableAnimations).toBe(false);
      expect(Platform.Version).toBe('');
      expect(Platform.constants).toBeUndefined();
    });

    it('does not consult a native PlatformConstants module even when one exists', () => {
      Object.assign(globalThis, {
        nativeModuleProxy: {
          PlatformConstants: { getConstants: () => TESTING_CONSTANTS },
        },
      });

      expect(Platform.isPad).toBe(false);
      expect(Platform.constants).toBeUndefined();
    });
  });
});
