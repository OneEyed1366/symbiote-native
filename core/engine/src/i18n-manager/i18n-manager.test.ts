// RN's `I18nManager` reached through the host, over the native module vitest.config.ts stubs
// (not RTL, left and right swap in RTL). It never throws, so there is no Negative group

import { afterEach, describe, expect, it } from 'vitest';
import { I18nManager } from '../react-native-host';

afterEach(() => {
  Reflect.set(I18nManager, 'isRTL', false);
});

describe('I18nManager', () => {
  it('mirrors the native constants on the plain fields', () => {
    expect(I18nManager.isRTL).toBe(false);
    expect(I18nManager.doLeftAndRightSwapInRTL).toBe(true);
    expect(I18nManager.getConstants().isRTL).toBe(false);
  });

  it('lets an app assign isRTL for the layout code that reads it live', () => {
    Reflect.set(I18nManager, 'isRTL', true);

    expect(I18nManager.isRTL).toBe(true);
  });

  it('accepts the three setters', () => {
    expect(() => I18nManager.allowRTL(true)).not.toThrow();
    expect(() => I18nManager.forceRTL(true)).not.toThrow();
    expect(() => I18nManager.swapLeftAndRightInRTL(true)).not.toThrow();
  });
});
