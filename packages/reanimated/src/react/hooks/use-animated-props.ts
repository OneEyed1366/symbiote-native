import { createUseAnimatedProps } from '../../core/animated-style-hooks';
import { useAnimatedUpdater } from './use-animated-updater';

export const useAnimatedProps = createUseAnimatedProps(useAnimatedUpdater);
