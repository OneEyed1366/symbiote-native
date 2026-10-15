import type {
  ILayoutAnimationBuilder,
  LayoutAnimationFunction,
} from 'react-native-reanimated/src/commonTypes';
import type { ReanimatedKeyframe } from 'react-native-reanimated/src/layoutReanimation';

export type IConfig =
  ILayoutAnimationBuilder | LayoutAnimationFunction | ReanimatedKeyframe;

export function isConfig(value: unknown): value is IConfig {
  return (
    typeof value === 'function' || (typeof value === 'object' && value !== null)
  );
}
