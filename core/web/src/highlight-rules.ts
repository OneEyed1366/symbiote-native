// What TouchableHighlight shows while pressed, from the C++ rule: the box takes the underlay color
// and its single child dims. Both go over the app's style, or a box with a background of its own
// would never be seen to respond

import { isRecord } from '@symbiote-native/engine';
import { cssFromBag, styleKeysOf } from './css-style';
import type { IDomSpec } from './spec-types';

type IBag = Readonly<Record<string, unknown>>;

const DEFAULT_UNDERLAY = 'black';
export const DEFAULT_ACTIVE_OPACITY = 0.85;

// Derived by the host: whether the underlay shows, and the app's `underlayColor` as it was given
export type IHighlightProps = { underlay?: unknown };

// Derived by the host for the single child of a pressed highlight
export type IHighlightChildProps = { highlightChild?: unknown };

// `null` is how an app asks for no tint, so only a missing color falls back to black
function tintOf(underlay: Record<string, unknown>): unknown {
  return underlay.hasColor === true ? underlay.color : DEFAULT_UNDERLAY;
}

export function highlightRules({
  underlay,
  ...authored
}: IBag): Partial<IDomSpec> {
  const style = styleKeysOf(authored);
  if (isRecord(underlay) && underlay.isActive === true) {
    const color = tintOf(underlay);
    if (color !== null) style.backgroundColor = color;
  }
  return { css: cssFromBag(style) };
}

export function highlightChildRules({
  highlightChild,
  ...authored
}: IBag): Partial<IDomSpec> {
  const style = styleKeysOf(authored);
  if (isRecord(highlightChild)) style.opacity = highlightChild.opacity;
  return { css: cssFromBag(style) };
}
