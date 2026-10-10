// The styles a windowed list derives from its inputs each pass. Pure, so the component's recompute
// only assigns the result

import {
  INVERTED_X_STYLE,
  INVERTED_Y_STYLE,
  cellStyleOf,
} from '@symbiote-native/components';
import {
  flattenStyle,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';

type IMaintainVisibleContentPosition = {
  minIndexForVisible: number;
  autoscrollToTopThreshold?: number;
};

export type IListStyleInput = {
  isHorizontal: boolean;
  isInverted: boolean;
  total: number;
  hasHeader: boolean;
  style: IStyleProp<IViewStyle> | undefined;
  contentContainerStyle: IStyleProp<IViewStyle> | undefined;
  listHeaderComponentStyle: IStyleProp<IViewStyle> | undefined;
  listFooterComponentStyle: IStyleProp<IViewStyle> | undefined;
  // The class-derived style of the list's own anchor host
  anchorStyle: unknown;
  maintainVisibleContentPosition: IMaintainVisibleContentPosition | undefined;
};

export type IListStyles = {
  // Bound to `[style]`, which Angular compiles to an instruction that only understands a flat
  // object, so it is always pre-flattened
  style: IViewStyle | undefined;
  contentContainerStyle: IStyleProp<IViewStyle> | undefined;
  cellStyle: IViewStyle | undefined;
  // The slot wrappers counter-flip with an inverted list, then take the slot's own style
  headerStyle: IViewStyle | undefined;
  footerStyle: IViewStyle | undefined;
  maintainVisibleContentPosition: IMaintainVisibleContentPosition | undefined;
};

function slotStyle(
  isInverted: boolean,
  inversion: IViewStyle,
  style: IStyleProp<IViewStyle> | undefined,
): IViewStyle | undefined {
  return flattenStyle(isInverted ? [inversion, style] : style);
}

export function resolveListStyles(input: IListStyleInput): IListStyles {
  const inversion = input.isHorizontal ? INVERTED_X_STYLE : INVERTED_Y_STYLE;
  const mvcp = input.maintainVisibleContentPosition;
  return {
    contentContainerStyle: input.isHorizontal
      ? [input.contentContainerStyle, { width: input.total }]
      : input.contentContainerStyle,
    // The app's style comes after the inversion, so it can override the flip
    style: flattenStyle([
      input.anchorStyle,
      input.isInverted ? [inversion, input.style] : input.style,
    ]),
    cellStyle: flattenStyle(
      cellStyleOf({
        horizontal: input.isHorizontal,
        inverted: input.isInverted,
      }),
    ),
    headerStyle: slotStyle(
      input.isInverted,
      inversion,
      input.listHeaderComponentStyle,
    ),
    footerStyle: slotStyle(
      input.isInverted,
      inversion,
      input.listFooterComponentStyle,
    ),
    maintainVisibleContentPosition:
      mvcp === undefined
        ? undefined
        : {
            ...mvcp,
            minIndexForVisible:
              mvcp.minIndexForVisible + (input.hasHeader ? 1 : 0),
          },
  };
}
