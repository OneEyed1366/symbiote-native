import { useEffect, useState } from 'react';
import { logger } from 'react-native-reanimated/src/common';
import type { DependencyList } from 'react-native-reanimated/src/hook/commonTypes';
import { createAnimatedReaction } from '../../core/animated-reaction';
import { requireWorklet } from '../../core/worklet-guard';

const DEPENDENCIES_WARNING =
  'Dependencies should only be used on the web and are always ignored on native. Check DevTools to see the offending code.';

export function useAnimatedReaction<PreparedResult>(
  prepare: () => PreparedResult,
  react: (prepared: PreparedResult, previous: PreparedResult | null) => void,
  dependencies?: DependencyList,
): void {
  if (__DEV__ && dependencies !== undefined) {
    logger.warnOnce(DEPENDENCIES_WARNING, 1);
  }
  const preparing = requireWorklet(prepare, 'useAnimatedReaction');
  const reacting = requireWorklet(react, 'useAnimatedReaction');
  const [controller] = useState(() => createAnimatedReaction<PreparedResult>());
  useEffect(() => controller.dispose, [controller]);
  useEffect(
    () => {
      controller.start(preparing, reacting);
      return controller.stop;
      // The mapper restarts with whatever the pair reads, which the controller lists
    },
    controller.dependenciesOf(preparing, reacting),
  );
}
