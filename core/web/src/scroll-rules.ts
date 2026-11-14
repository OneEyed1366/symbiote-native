// What a ScrollView asks of its elements. The tag tells the scroller from its content and the axis
// from the other, as the engine's own tag rules read it on a device

import { isRecord } from '@symbiote-native/engine';
import type { ICssDeclarations } from './css-values';
import { CLASS_NAMES } from './reset-sheet';

export type IScrollRules = { classNames: string[]; css: ICssDeclarations };

// The last group tunes a native feel (physics, edge glow, event rate) a page has no twin for
export type IScrollProps = {
  scrollEnabled?: unknown;
  showsVerticalScrollIndicator?: unknown;
  showsHorizontalScrollIndicator?: unknown;
  pagingEnabled?: unknown;
  bounces?: unknown;
  scrollEventThrottle?: unknown;
  decelerationRate?: unknown;
  alwaysBounceVertical?: unknown;
  alwaysBounceHorizontal?: unknown;
  directionalLockEnabled?: unknown;
  nestedScrollEnabled?: unknown;
  overScrollMode?: unknown;
  persistentScrollbar?: unknown;
  fadingEdgeLength?: unknown;
  endFillColor?: unknown;
  indicatorStyle?: unknown;
  contentOffset?: unknown;
  centerContent?: unknown;
};

// Where the scroller starts, which later writes of the prop do not move
export function initialOffsetOf({
  contentOffset,
}: IScrollProps): { x: number; y: number } | undefined {
  if (!isRecord(contentOffset)) return undefined;
  const { x, y } = contentOffset;
  return {
    x: typeof x === 'number' ? x : 0,
    y: typeof y === 'number' ? y : 0,
  };
}

const NONE: IScrollRules = { classNames: [], css: {} };

function scroller(isHorizontal: boolean, props: IScrollProps): IScrollRules {
  const isBarHidden = isHorizontal
    ? props.showsHorizontalScrollIndicator === false
    : props.showsVerticalScrollIndicator === false;
  const classNames: string[] = [
    isHorizontal ? CLASS_NAMES.scrollX : CLASS_NAMES.scrollY,
  ];
  if (isBarHidden) classNames.push(CLASS_NAMES.noScrollbar);
  if (props.pagingEnabled === true) {
    classNames.push(isHorizontal ? CLASS_NAMES.snapX : CLASS_NAMES.snapY);
  }
  if (props.centerContent === true) classNames.push(CLASS_NAMES.centerContent);
  const css: ICssDeclarations = {};
  if (props.scrollEnabled === false) css.overflow = 'hidden';
  if (props.bounces === false) css['overscroll-behavior'] = 'none';
  return { classNames, css };
}

export function scrollRules(
  tagName: string,
  props: IScrollProps,
): IScrollRules {
  switch (tagName) {
    case 'scroll-view':
      return scroller(false, props);
    case 'horizontal-scroll-view':
      return scroller(true, props);
    case 'horizontal-scroll-content':
      return { classNames: [CLASS_NAMES.scrollContentX], css: {} };
    default:
      return NONE;
  }
}
