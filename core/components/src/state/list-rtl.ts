// RTL horizontal lists: RN keeps offsets flow-relative (from the right edge) and converts at the
// native boundary, `ListMetricsAggregator.flowRelativeOffset` / `cartesianOffset`

import { I18nManager } from '@symbiote-native/engine';
import type {
  IListAction,
  IListEffect,
  IListReduceResult,
  IListReducerInputs,
} from './list-reducer-types';

const SCROLL_TO_OFFSET_WARNING =
  'scrollToOffset may not be called in RTL before content is laid out';
const CONTENT_LAYOUT_WARNING =
  'ListMetricsAggregator must be notified of list content layout before resolving offsets';

// RN reads `I18nManager.isRTL` on every orientation lookup, so a list follows it live
export function isRtlLayout(): boolean {
  return I18nManager.isRTL;
}

export function isRtlList(
  inputs: Pick<IListReducerInputs<unknown>, 'horizontal' | 'rtl'>,
): boolean {
  return inputs.horizontal && inputs.rtl === true;
}

// A cell's x as counted from the right edge, undefined while the content length is unknown
export function flowRelativeOffset(
  contentLength: number | undefined,
  x: number,
  length: number,
): number | undefined {
  return contentLength === undefined ? undefined : contentLength - (x + length);
}

// A scroll event's x as counted from the right edge of the content
export function flowRelativeScrollOffset(
  x: number,
  contentLength: number,
  viewportLength: number,
): number {
  return contentLength - (x + viewportLength);
}

// A flow-relative offset as the cartesian x the scroll view takes, right-aligned by the viewport
export function cartesianScrollOffset(
  contentLength: number,
  offset: number,
  viewportLength: number,
): number {
  return contentLength - (offset + viewportLength);
}

// Every `scroll-to` the reducer produced, in the cartesian space the scroll view speaks
// Without a content length RN warns (`scrollToOffset`) or throws, here the scroll is dropped
export function withCartesianScrollTo<ItemT>(
  result: IListReduceResult<ItemT>,
  action: IListAction<ItemT>,
): IListReduceResult<ItemT> {
  const { state } = result;
  const effects: IListEffect<ItemT>[] = [];
  for (const effect of result.effects) {
    if (effect.kind !== 'scroll-to') {
      effects.push(effect);
    } else if (state.contentLength === undefined) {
      console.warn(
        action.kind === 'scroll-to-offset'
          ? SCROLL_TO_OFFSET_WARNING
          : CONTENT_LAYOUT_WARNING,
      );
    } else {
      effects.push({
        ...effect,
        offset: cartesianScrollOffset(
          state.contentLength,
          effect.offset,
          state.viewportLength,
        ),
      });
    }
  }
  return { ...result, effects };
}
