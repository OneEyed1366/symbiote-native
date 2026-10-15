import { useEffect, useState } from 'react';
import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import { createSharedValue } from '../../core/shared-value';

// A function `initialValue` is called once on mount; a shared value must not hold functions
export function useSharedValue<Value>(
  initialValue: Value | (() => Value),
): SharedValue<Value> {
  const [controller] = useState(() => createSharedValue(initialValue));
  useEffect(() => controller.dispose, [controller]);
  return controller.shared;
}
