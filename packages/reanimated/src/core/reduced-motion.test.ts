import { describe, expect, it } from 'vitest';
import { ReduceMotion } from 'react-native-reanimated/src/commonTypes';
import { ReducedMotionManager } from 'react-native-reanimated/src/ReducedMotion';
import { overrideReducedMotion } from './reduced-motion';

describe('overriding the reduced motion setting', () => {
  it('turns it on for the mode Always', () => {
    const release = overrideReducedMotion(ReduceMotion.Always);

    expect(ReducedMotionManager.jsValue).toBe(true);
    release();
  });

  it('turns it off for the mode Never', () => {
    ReducedMotionManager.setEnabled(true);
    const release = overrideReducedMotion(ReduceMotion.Never);

    expect(ReducedMotionManager.jsValue).toBe(false);
    release();
    ReducedMotionManager.setEnabled(false);
  });

  it('puts the setting back as it was once released', () => {
    ReducedMotionManager.setEnabled(false);
    const release = overrideReducedMotion(ReduceMotion.Always);

    release();

    expect(ReducedMotionManager.jsValue).toBe(false);
  });

  it('writes the setting to the UI side as well', () => {
    const release = overrideReducedMotion(ReduceMotion.Always);

    expect(ReducedMotionManager.uiValue.value).toBe(true);
    release();
  });
});
