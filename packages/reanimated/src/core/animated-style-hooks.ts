import type { WorkletFunction } from 'react-native-worklets';
import { logger } from 'react-native-reanimated/src/common';
import type { AnimatedPropsAdapterFunction } from 'react-native-reanimated/src/commonTypes';
import type {
  AnimatedStyleHandle,
  DefaultStyle,
  DependencyList,
} from 'react-native-reanimated/src/hook/commonTypes';
import {
  createAnimatedPropsController,
  createAnimatedStyleController,
  type IAnimatedStyleController,
  type IStyleBag,
} from './animated-style';
import { requireWorklet } from './worklet-guard';

const DEPENDENCIES_WARNING =
  'Dependencies should only be used on the web and are always ignored on native. Check DevTools to see the offending code.';

// What an adapter supplies: its lifecycle around the controller. `onRender` is told of the
// controller each time the hook runs, once in a framework whose setup runs once
export type IUseUpdater = (
  updater: WorkletFunction<[], IStyleBag>,
  create: (updater: WorkletFunction<[], IStyleBag>) => IAnimatedStyleController,
  onRender?: (controller: IAnimatedStyleController) => void,
) => IAnimatedStyleController['handle'];

export function warnAboutDependencies(
  dependencies: unknown,
  stackDepth: number,
): void {
  if (__DEV__ && dependencies !== undefined && dependencies !== null) {
    logger.warnOnce(DEPENDENCIES_WARNING, stackDepth);
  }
}

export function createUseAnimatedStyle(useUpdater: IUseUpdater) {
  return function useAnimatedStyle<Style extends DefaultStyle>(
    updater: () => Style,
    dependencies?: DependencyList | null,
  ): AnimatedStyleHandle<Style> {
    warnAboutDependencies(dependencies, 1);
    const worklet = requireWorklet(updater, 'useAnimatedStyle');
    return useUpdater(worklet, createAnimatedStyleController);
  };
}

export function createUseAnimatedProps(useUpdater: IUseUpdater) {
  return function useAnimatedProps<Props extends object>(
    updater: () => Partial<Props>,
    dependencies?: DependencyList | null,
    adapters?:
      AnimatedPropsAdapterFunction | AnimatedPropsAdapterFunction[] | null,
  ): AnimatedStyleHandle<Partial<Props>> {
    warnAboutDependencies(dependencies, 2);
    const worklet = requireWorklet(updater, 'useAnimatedProps');
    const adapterWorklets = [adapters ?? []]
      .flat()
      .map(adapter => requireWorklet(adapter, 'useAnimatedProps'));
    return useUpdater(
      worklet,
      current =>
        createAnimatedPropsController(current, { adapters: adapterWorklets }),
      controller => controller.adapt(adapterWorklets),
    );
  };
}
