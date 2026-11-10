import type { WorkletFunction } from 'react-native-worklets';
import type { DependencyList } from 'react-native-reanimated/src/hook/commonTypes';
import { warnAboutDependencies } from './animated-style-hooks';
import type { IHandlerObservation, IHandlerState } from './event-handlers';
import { requireWorklet } from './worklet-guard';

// What the hooks check before an adapter does anything with the callbacks, the same in each
export function derivedWorklet<Value>(
  updater: () => Value,
  dependencies: DependencyList | undefined,
): WorkletFunction<[], Value> {
  warnAboutDependencies(dependencies, 1);
  return requireWorklet(updater, 'useDerivedValue');
}

export function observeHandlers<Context extends Record<string, unknown>>(
  state: IHandlerState<Context>,
  handlers: Record<string, unknown>,
  dependencies: DependencyList | undefined,
): IHandlerObservation<Context> {
  warnAboutDependencies(dependencies, 1);
  return state.observe(handlers);
}

export function reactionWorklets<Prepared>(
  prepare: () => Prepared,
  react: (prepared: Prepared, previous: Prepared | null) => void,
  dependencies: DependencyList | undefined,
) {
  warnAboutDependencies(dependencies, 1);
  return {
    preparing: requireWorklet(prepare, 'useAnimatedReaction'),
    reacting: requireWorklet(react, 'useAnimatedReaction'),
  };
}
