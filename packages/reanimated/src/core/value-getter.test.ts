import { describe, expect, it } from 'vitest';
import { isWorkletFunction } from 'react-native-worklets';
import { valueGetter } from './value-getter';

describe('the getter of a value', () => {
  it('returns the value it was made for', () => {
    expect(valueGetter(0.5)()).toBe(0.5);
  });

  it('is a worklet, so the UI runtime can call it where the accessor it stands for cannot go', () => {
    expect(isWorkletFunction(valueGetter(1))).toBe(true);
  });
});
