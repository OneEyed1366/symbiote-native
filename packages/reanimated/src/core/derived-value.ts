import type { WorkletFunction } from 'react-native-worklets';
import { initialUpdaterRun } from 'react-native-reanimated/src/animation';
import {
  makeMutable,
  startMapper,
  stopMapper,
} from 'react-native-reanimated/src/core';
import { isSharedValue } from 'react-native-reanimated/src/isSharedValue';
import type { DerivedValue } from 'react-native-reanimated/src/hook/useDerivedValueCommon';

export type IDerivedValueController<Value> = {
  derived: DerivedValue<Value>;
  // Registers the mapper that keeps `derived` current, after stopping the one standing
  start: (updater: WorkletFunction<[], Value>) => void;
  stop: () => void;
  // A change in any of them means `start` again
  dependenciesOf: (updater: WorkletFunction<[], Value>) => unknown[];
};

export function createDerivedValue<Value>(
  updater: WorkletFunction<[], Value>,
): IDerivedValueController<Value> {
  const derived = makeMutable(initialUpdaterRun(updater));
  let mapperId: number | undefined;

  function stop(): void {
    if (mapperId !== undefined) stopMapper(mapperId);
    mapperId = undefined;
  }

  return {
    derived,
    start: current => {
      stop();
      const fun = () => {
        'worklet';
        derived.value = current();
      };
      const outputs = isSharedValue(derived) ? [derived] : [];
      mapperId = startMapper(fun, current.__closure ?? [], outputs);
    },
    stop,
    dependenciesOf: current => [
      ...(current.__closure ?? []),
      current.__workletHash,
    ],
  };
}
