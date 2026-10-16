import type { DependencyList } from 'react-native-reanimated/src/hook/commonTypes';
import type { DerivedValue } from 'react-native-reanimated/src/hook/useDerivedValueCommon';
import { createAnimatedReaction } from '../animated-reaction';
import {
  createUseAnimatedProps,
  createUseAnimatedStyle,
  type IUseUpdater,
} from '../animated-style-hooks';
import { createDerivedValue } from '../derived-value';
import { markFlattenable } from '../handle-binding';
import { derivedWorklet, reactionWorklets } from '../hook-inputs';
import { snapshotWorklet } from '../worklet-snapshot';
import type { ISetupOnceLifecycle } from './lifecycle';

// The hooks that keep a mapper standing for as long as the scope does
export function createMapperHooks({
  onDispose,
  followInScope,
  readAccessor,
}: ISetupOnceLifecycle) {
  // The mapper follows what the updater reads and starts again over a fresh snapshot of it
  const useAnimatedUpdater: IUseUpdater = (updater, create, onRender) => {
    const controller = create(snapshotWorklet(updater, readAccessor));
    onRender?.(controller);
    followInScope(updater, () =>
      controller.start(snapshotWorklet(updater, readAccessor)),
    );
    controller.activate();
    onDispose(controller.dispose);
    // A framework may flatten a `style` array before the renderer sees it, handle keys and all
    return markFlattenable(controller.handle);
  };

  function useDerivedValue<Value>(
    updater: () => Value,
    dependencies?: DependencyList,
  ): DerivedValue<Value> {
    const worklet = derivedWorklet(updater, dependencies);
    const controller = createDerivedValue(
      snapshotWorklet(worklet, readAccessor),
    );
    followInScope(worklet, () =>
      controller.start(snapshotWorklet(worklet, readAccessor)),
    );
    onDispose(controller.stop);
    return controller.derived;
  }

  function useAnimatedReaction<PreparedResult>(
    prepare: () => PreparedResult,
    react: (prepared: PreparedResult, previous: PreparedResult | null) => void,
    dependencies?: DependencyList,
  ): void {
    const { preparing, reacting } = reactionWorklets(
      prepare,
      react,
      dependencies,
    );
    const controller = createAnimatedReaction<PreparedResult>();
    followInScope(preparing, () =>
      controller.start(
        snapshotWorklet(preparing, readAccessor),
        snapshotWorklet(reacting, readAccessor),
      ),
    );
    onDispose(controller.dispose);
  }

  return {
    useAnimatedStyle: createUseAnimatedStyle(useAnimatedUpdater),
    useAnimatedProps: createUseAnimatedProps(useAnimatedUpdater),
    useDerivedValue,
    useAnimatedReaction,
  };
}
