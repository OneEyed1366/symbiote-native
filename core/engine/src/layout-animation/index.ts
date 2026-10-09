// The runtime is RN's own `LayoutAnimation`, forwarded through `react-native-host`

import { LayoutAnimation } from '../react-native-host';
import type { ILayoutAnimationType } from './types';

export type {
  ILayoutAnimationType,
  ILayoutAnimationProperty,
  ILayoutAnimationTypes,
  ILayoutAnimationProperties,
  ILayoutAnimationAnim,
  ILayoutAnimationConfig,
} from './types';

// RN's `Keyboard` does this inline: an easing that is not a `Types` key animates as 'keyboard'
export function coerceLayoutAnimationType(
  easing: string,
): ILayoutAnimationType {
  const types: Readonly<Record<string, ILayoutAnimationType>> =
    LayoutAnimation.Types;
  return types[easing] ?? 'keyboard';
}
