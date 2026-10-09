import { logger } from 'react-native-reanimated/src/common';
import type {
  AnimatedStyleHandle,
  DefaultStyle,
  DependencyList,
} from 'react-native-reanimated/src/hook/commonTypes';
import { createAnimatedStyleController } from '../../core/animated-style';
import { requireWorklet } from '../../core/worklet-guard';
import { useAnimatedUpdater } from './use-animated-updater';

const DEPENDENCIES_WARNING =
  'Dependencies should only be used on the web and are always ignored on native. Check DevTools to see the offending code.';

export function useAnimatedStyle<Style extends DefaultStyle>(
  updater: () => Style,
  dependencies?: DependencyList | null,
): AnimatedStyleHandle<Style> {
  if (__DEV__ && dependencies !== undefined && dependencies !== null) {
    logger.warnOnce(DEPENDENCIES_WARNING, 1);
  }
  const worklet = requireWorklet(updater, 'useAnimatedStyle');
  return useAnimatedUpdater(worklet, createAnimatedStyleController);
}
