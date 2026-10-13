import { defineComponent, watch } from '@vue/runtime-core';
import type { ReduceMotion } from 'react-native-reanimated/src/commonTypes';
import { overrideReducedMotion } from '../core/reduced-motion';

// Lets you overwrite the default reduce motion behavior for the whole app, while it stands
export const ReducedMotionConfig = defineComponent(
  (props: { mode: ReduceMotion }) => {
    watch(
      () => props.mode,
      (mode, _previous, onCleanup) => onCleanup(overrideReducedMotion(mode)),
      { immediate: true },
    );
    return () => null;
  },
  { name: 'ReducedMotionConfig', props: ['mode'] },
);
