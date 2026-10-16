import type { Component } from 'svelte';
import type { ReduceMotion } from 'react-native-reanimated/src/commonTypes';

export type IReducedMotionConfigProps = { mode: ReduceMotion };

declare const ReducedMotionConfig: Component<IReducedMotionConfigProps>;
export default ReducedMotionConfig;
