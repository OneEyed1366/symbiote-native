import { isReducedMotionEnabledInSystem } from 'react-native-reanimated/src/ReducedMotion';

const IS_REDUCED_MOTION_ENABLED_IN_SYSTEM = isReducedMotionEnabledInSystem();

// Changing the system setting does not render a component again, as upstream
export function useReducedMotion(): boolean {
  return IS_REDUCED_MOTION_ENABLED_IN_SYSTEM;
}
