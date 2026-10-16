// Port of RN's `useWindowDimensions`: seeds from `Dimensions.get('window')`, subscribes to 'change'
// TODO(rn-port): RN's module loads `NativeDeviceInfo` eagerly, which needs a bridge itests lack

import { useEffect, useState } from 'react';
import {
  Dimensions,
  type IDimensionsSet,
  type IDisplayMetrics,
} from '@symbiote-native/engine';

export function useWindowDimensions(): IDisplayMetrics {
  const [dimensions, setDimensions] = useState<IDisplayMetrics>(() =>
    Dimensions.get('window'),
  );

  useEffect(() => {
    function handleChange(window: IDisplayMetrics): void {
      const hasChanged =
        dimensions.width !== window.width ||
        dimensions.height !== window.height ||
        dimensions.scale !== window.scale ||
        dimensions.fontScale !== window.fontScale;
      if (hasChanged) setDimensions(window);
    }

    const subscription = Dimensions.addEventListener(
      'change',
      (set: IDimensionsSet) => {
        handleChange(set.window);
      },
    );
    // An update may land between `get` in render and the subscription, so re-check now
    handleChange(Dimensions.get('window'));
    return () => {
      subscription.remove();
    };
  }, [dimensions]);

  return dimensions;
}
