import { createEffect, onCleanup } from 'solid-js';
import type { ReduceMotion } from 'react-native-reanimated/src/commonTypes';
import { overrideReducedMotion } from '../core/reduced-motion';

// Lets you overwrite the default reduce motion behavior for the whole app, while it stands
export function ReducedMotionConfig(props: { mode: ReduceMotion }): null {
  createEffect(() => onCleanup(overrideReducedMotion(props.mode)));
  return null;
}
