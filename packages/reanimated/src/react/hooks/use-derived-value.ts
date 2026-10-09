import { useEffect, useState } from 'react';
import { logger } from 'react-native-reanimated/src/common';
import type { DependencyList } from 'react-native-reanimated/src/hook/commonTypes';
import type { DerivedValue } from 'react-native-reanimated/src/hook/useDerivedValueCommon';
import { createDerivedValue } from '../../core/derived-value';
import { requireWorklet } from '../../core/worklet-guard';

const DEPENDENCIES_WARNING =
  'Dependencies should only be used on the web and are always ignored on native. Check DevTools to see the offending code.';

export function useDerivedValue<Value>(
  updater: () => Value,
  dependencies?: DependencyList,
): DerivedValue<Value> {
  if (__DEV__ && dependencies !== undefined) {
    logger.warnOnce(DEPENDENCIES_WARNING, 1);
  }
  const worklet = requireWorklet(updater, 'useDerivedValue');
  const [controller] = useState(() => createDerivedValue(worklet));
  useEffect(() => {
    controller.start(worklet);
    return controller.stop;
    // The mapper restarts with whatever the updater reads, which the controller lists
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, controller.dependenciesOf(worklet));
  return controller.derived;
}
