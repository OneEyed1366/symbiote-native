import { useEffect, useState } from 'react';
import type { DependencyList } from 'react-native-reanimated/src/hook/commonTypes';
import type { DerivedValue } from 'react-native-reanimated/src/hook/useDerivedValueCommon';
import { createDerivedValue } from '../../core/derived-value';
import { derivedWorklet } from '../../core/hook-inputs';

export function useDerivedValue<Value>(
  updater: () => Value,
  dependencies?: DependencyList,
): DerivedValue<Value> {
  const worklet = derivedWorklet(updater, dependencies);
  const [controller] = useState(() => createDerivedValue(worklet));
  useEffect(() => {
    controller.start(worklet);
    return controller.stop;
    // The mapper restarts with whatever the updater reads, which the controller lists
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, controller.dependenciesOf(worklet));
  return controller.derived;
}
