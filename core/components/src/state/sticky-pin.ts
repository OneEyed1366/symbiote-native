// Узел, которым двигается sticky-заголовок: `scrollValue` через диапазоны пина
// плюс смещение `hiddenOnScroll`, если ScrollView его включил

import {
  add,
  diffClamp,
  type AnimatedNode,
  type AnimatedValue,
} from '@symbiote-native/engine';
import type { IStickyHideOffset } from './sticky-header-reducer';

type IPinRanges = { inputRange: number[]; outputRange: number[] };

// `diffClamp` копит только дельту скролла в `-layoutHeight..0`, поэтому скролл назад
// возвращает спрятанную высоту
function hideOffsetNode(
  scrollValue: AnimatedValue,
  { layoutY, layoutHeight }: IStickyHideOffset,
): AnimatedNode {
  const pastHeader = scrollValue
    .interpolate({
      extrapolateLeft: 'clamp',
      inputRange: [layoutY, layoutY + 1],
      outputRange: [0, 1],
    })
    .interpolate({ inputRange: [0, 1], outputRange: [0, -1] });
  return diffClamp(pastHeader, -layoutHeight, 0);
}

export function buildStickyPin(
  scrollValue: AnimatedValue,
  ranges: IPinRanges,
  hideOffset: IStickyHideOffset | undefined,
): AnimatedNode {
  const pin = scrollValue.interpolate(ranges);
  return hideOffset === undefined
    ? pin
    : add(pin, hideOffsetNode(scrollValue, hideOffset));
}
