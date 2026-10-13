import { useEffect, useState } from 'react';
import type { DependencyList } from 'react-native-reanimated/src/hook/commonTypes';
import { createAnimatedReaction } from '../../core/animated-reaction';
import { reactionWorklets } from '../../core/hook-inputs';

export function useAnimatedReaction<PreparedResult>(
  prepare: () => PreparedResult,
  react: (prepared: PreparedResult, previous: PreparedResult | null) => void,
  dependencies?: DependencyList,
): void {
  const { preparing, reacting } = reactionWorklets(
    prepare,
    react,
    dependencies,
  );
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
