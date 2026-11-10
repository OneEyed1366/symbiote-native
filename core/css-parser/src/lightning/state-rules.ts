import {
  isMotionKey,
  type IPlainStyle,
  type IRuleStyle,
} from './animations.ts';

// A rule on a state writes each value under it, `{ ':hover': value }`, and the cascade of the
// engine joins that with the base of the same property
// A motion key cannot hold for one state only, so it is left out and handed to `onMotionKey`
export function stateStyle(
  style: IPlainStyle,
  state: string,
  onMotionKey: (key: string) => void,
): IRuleStyle {
  const written: IRuleStyle = {};
  for (const [key, value] of Object.entries(style)) {
    if (isMotionKey(key)) {
      onMotionKey(key);
    } else {
      written[key] = { [state]: value };
    }
  }
  return written;
}
