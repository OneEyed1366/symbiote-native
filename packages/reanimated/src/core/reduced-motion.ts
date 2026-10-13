import { logger } from 'react-native-reanimated/src/common';
import { ReduceMotion } from 'react-native-reanimated/src/commonTypes';
import {
  isReducedMotionEnabledInSystem,
  ReducedMotionManager,
} from 'react-native-reanimated/src/ReducedMotion';

const IS_REDUCED_MOTION_ENABLED_IN_SYSTEM = isReducedMotionEnabledInSystem();

// Changing the system setting does not render a component again, as upstream
export function reducedMotionAtStart(): boolean {
  return IS_REDUCED_MOTION_ENABLED_IN_SYSTEM;
}

function isEnabledFor(mode: ReduceMotion): boolean {
  if (mode === ReduceMotion.System) return isReducedMotionEnabledInSystem();
  return mode === ReduceMotion.Always;
}

// What `ReducedMotionConfig` does while it stands; the returned release puts the setting back
export function overrideReducedMotion(mode: ReduceMotion): () => void {
  if (__DEV__) {
    logger.warn(`Reduced motion setting is overwritten with mode '${mode}'.`);
  }
  const wasEnabled = ReducedMotionManager.jsValue;
  ReducedMotionManager.setEnabled(isEnabledFor(mode));
  return () => ReducedMotionManager.setEnabled(wasEnabled);
}
