import { describe, expect, it } from 'vitest';
import { workletOf } from '../../test-support/worklet';
import { requireWorklet } from './worklet-guard';

describe('requireWorklet', () => {
  it('hands a worklet back as it is', () => {
    const worklet = workletOf(() => 1, []);

    expect(requireWorklet(worklet, 'useDerivedValue')).toBe(worklet);
  });

  it('refuses a plain function and names the hook that was given it', () => {
    expect(() => requireWorklet(() => 1, 'useDerivedValue')).toThrow(
      /useDerivedValue.*worklet/,
    );
  });
});
