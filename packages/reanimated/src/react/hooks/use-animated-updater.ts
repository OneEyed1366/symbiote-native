import { useEffect, useState } from 'react';
import type { WorkletFunction } from 'react-native-worklets';
import type {
  IAnimatedStyleController,
  IStyleBag,
} from '../../core/animated-style';

// The React lifecycle both `useAnimatedStyle` and `useAnimatedProps` share: the mapper follows the
// updater, and the animations may write only while the component stands
export function useAnimatedUpdater(
  updater: WorkletFunction<[], IStyleBag>,
  create: (updater: WorkletFunction<[], IStyleBag>) => IAnimatedStyleController,
  onRender?: (controller: IAnimatedStyleController) => void,
): IAnimatedStyleController['handle'] {
  const [controller] = useState(() => create(updater));
  onRender?.(controller);
  useEffect(() => {
    controller.start(updater);
    return controller.stop;
    // The mapper restarts with whatever the updater reads, which the controller lists
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, controller.dependenciesOf(updater));
  useEffect(() => {
    controller.activate();
    return controller.dispose;
  }, [controller]);
  return controller.handle;
}
