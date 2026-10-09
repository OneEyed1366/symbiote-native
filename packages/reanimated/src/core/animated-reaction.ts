import type { WorkletFunction } from 'react-native-worklets';
import { startMapper, stopMapper } from 'react-native-reanimated/src/core';
import { createSharedValue } from './shared-value';

type IPrepare<Prepared> = WorkletFunction<[], Prepared>;
type IReact<Prepared> = WorkletFunction<
  [prepared: Prepared, previous: Prepared | null],
  void
>;

export type IAnimatedReactionController<Prepared> = {
  // Registers the mapper for the pair, after stopping the one standing
  start: (prepare: IPrepare<Prepared>, react: IReact<Prepared>) => void;
  stop: () => void;
  // A change in any of them means `start` again
  dependenciesOf: (
    prepare: IPrepare<Prepared>,
    react: IReact<Prepared>,
  ) => unknown[];
  dispose: () => void;
};

export function createAnimatedReaction<
  Prepared = unknown,
>(): IAnimatedReactionController<Prepared> {
  // Outlives a restart, so the reaction sees the value the previous pair left behind
  const previous = createSharedValue<Prepared | null>(null);
  let mapperId: number | undefined;

  function stop(): void {
    if (mapperId !== undefined) stopMapper(mapperId);
    mapperId = undefined;
  }

  return {
    start: (prepare, react) => {
      stop();
      const fun = () => {
        'worklet';
        const input = prepare();
        react(input, previous.shared.value);
        previous.shared.value = input;
      };
      mapperId = startMapper(fun, prepare.__closure ?? []);
    },
    stop,
    dependenciesOf: (prepare, react) => [
      ...(prepare.__closure ?? []),
      ...(react.__closure ?? []),
      prepare.__workletHash,
      react.__workletHash,
    ],
    dispose: () => {
      stop();
      previous.dispose();
    },
  };
}
