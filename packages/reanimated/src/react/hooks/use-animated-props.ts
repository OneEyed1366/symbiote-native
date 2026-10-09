import { logger } from 'react-native-reanimated/src/common';
import type { AnimatedPropsAdapterFunction } from 'react-native-reanimated/src/commonTypes';
import type {
  AnimatedStyleHandle,
  DependencyList,
} from 'react-native-reanimated/src/hook/commonTypes';
import { createAnimatedPropsController } from '../../core/animated-style';
import { requireWorklet } from '../../core/worklet-guard';
import { useAnimatedUpdater } from './use-animated-updater';

const DEPENDENCIES_WARNING =
  'Dependencies should only be used on the web and are always ignored on native. Check DevTools to see the offending code.';

export function useAnimatedProps<Props extends object>(
  updater: () => Partial<Props>,
  dependencies?: DependencyList | null,
  adapters?:
    AnimatedPropsAdapterFunction | AnimatedPropsAdapterFunction[] | null,
): AnimatedStyleHandle<Partial<Props>> {
  if (__DEV__ && dependencies !== undefined && dependencies !== null) {
    logger.warnOnce(DEPENDENCIES_WARNING, 2);
  }
  const worklet = requireWorklet(updater, 'useAnimatedProps');
  const adapterWorklets = [adapters ?? []]
    .flat()
    .map(adapter => requireWorklet(adapter, 'useAnimatedProps'));
  return useAnimatedUpdater(
    worklet,
    current =>
      createAnimatedPropsController(current, { adapters: adapterWorklets }),
    controller => controller.adapt(adapterWorklets),
  );
}
