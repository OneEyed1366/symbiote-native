import { createUseAnimatedStyle } from '../../core/animated-style-hooks';
import { useAnimatedUpdater } from './use-animated-updater';

export const useAnimatedStyle = createUseAnimatedStyle(useAnimatedUpdater);
