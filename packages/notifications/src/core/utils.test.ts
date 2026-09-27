import { describe, expect, it } from 'vitest';

import { hasValidTriggerObject } from './utils';

// Ported from expo-notifications' hasInvalidTriggerObject-test.ts (upstream's file name is
// stale — it tests `hasValidTriggerObject`).
describe('hasValidTriggerObject', () => {
  it('returns true for null', () => {
    expect(hasValidTriggerObject(null)).toBe(true);
  });

  it('returns true when type / channelId key is present (regardless of value) — an approximation', () => {
    expect(hasValidTriggerObject({ type: 'whatever' })).toBe(true);
    expect(hasValidTriggerObject({ channelId: 'whatever' })).toBe(true);
  });

  it('returns false for a plain object without type/channelId', () => {
    expect(hasValidTriggerObject({})).toBe(false);
    expect(hasValidTriggerObject({ foo: 'bar' })).toBe(false);
  });

  it('returns false for a non-object trigger', () => {
    expect(hasValidTriggerObject('whatever')).toBe(false);
    expect(hasValidTriggerObject(42)).toBe(false);
  });
});
