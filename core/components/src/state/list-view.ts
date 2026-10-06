// Style and prop derivation for the scroll tag a list renders, the same for every adapter

import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import { INVERTED_X_STYLE, INVERTED_Y_STYLE } from './list-constants';

type IAxis = { inverted: boolean; horizontal: boolean };

// Each cell carries the counter-flip of an inverted list so its content reads upright
export function counterFlipStyle(axis: IAxis): IViewStyle | undefined {
  if (!axis.inverted) return undefined;
  return axis.horizontal ? INVERTED_X_STYLE : INVERTED_Y_STYLE;
}

const ROW_STYLE: IViewStyle = { flexDirection: 'row' };
const ROW_REVERSE_STYLE: IViewStyle = { flexDirection: 'row-reverse' };
const COLUMN_REVERSE_STYLE: IViewStyle = { flexDirection: 'column-reverse' };

// RN's `cellStyle`: the wrapper of a cell holds the item and its separator, a horizontal list
// lays them in a row and an inverted one reverses them so the counter-flip reads in order
export function cellStyleOf(axis: IAxis): IStyleProp<IViewStyle> | undefined {
  const flip = counterFlipStyle(axis);
  if (flip === undefined) return axis.horizontal ? ROW_STYLE : undefined;
  return [axis.horizontal ? ROW_REVERSE_STYLE : COLUMN_REVERSE_STYLE, flip];
}

// The list's own `style` can override the flip, as in RN's `[inversionStyle, style]`
export function listStyleOf(
  axis: IAxis,
  style: IStyleProp<IViewStyle> | undefined,
): IStyleProp<IViewStyle> | undefined {
  const flip = counterFlipStyle(axis);
  return flip === undefined ? style : [flip, style];
}

// A horizontal list pins the content container to the full row width so the row overflows for iOS
// to scroll, the flip rides ONLY the outer ScrollView style and each cell, never this container
export function contentContainerStyleOf(
  horizontal: boolean,
  style: IStyleProp<IViewStyle> | undefined,
  total: number,
): IStyleProp<IViewStyle> | undefined {
  return horizontal ? [style, { width: total }] : style;
}

export function spacerStyleOf(extent: number, horizontal: boolean): IViewStyle {
  return horizontal ? { width: extent } : { height: extent };
}

type IMaintainPosition = {
  minIndexForVisible: number;
  autoscrollToTopThreshold?: number;
};

// Native anchors the in-window cells, `minIndexForVisible` counts a header at child 0
export function maintainPositionForScroll(
  maintain: IMaintainPosition | undefined,
  hasHeader: boolean,
): IMaintainPosition | undefined {
  if (maintain === undefined) return undefined;
  return {
    ...maintain,
    minIndexForVisible: maintain.minIndexForVisible + (hasHeader ? 1 : 0),
  };
}
