// Native events turned into reducer actions, the same for every adapter

import { dlog, type ISymbioteEvent } from '@symbiote-native/engine';
import { EMPTY_OFFSET } from './list-constants';
import { LIST_ACTION_KIND } from './list-kinds';
import {
  readContentLength,
  readLayoutLength,
  readLayoutOffset,
  readScrollOffset,
  readViewportLength,
} from './list-metrics';
import { flowRelativeScrollOffset, isRtlLayout } from './list-rtl';
import type { IListAction } from './list-reducer-types';
import {
  SEPARATOR_SIDE,
  type ISeparatorProps,
  type ISeparators,
  type ISeparatorSide,
} from './list-types';

// Undefined when the event carries no offset, the adapter ignores it
// An RTL horizontal event counts from the right edge of the content, RN's `_offsetFromScrollEvent`
export function scrollActionOf<ItemT>(
  event: ISymbioteEvent,
  horizontal: boolean,
  timestamp: number,
  isRtl: boolean = isRtlLayout(),
): IListAction<ItemT> | undefined {
  const x = readScrollOffset(event, horizontal);
  if (x === undefined) return undefined;
  const offset = flowScrollOffsetOf(event, x, horizontal && isRtl);
  if (offset === undefined) return undefined;
  dlog(`VirtualizedList onScroll offset=${offset}`);
  return { kind: LIST_ACTION_KIND.scroll, offset, timestamp };
}

function flowScrollOffsetOf(
  event: ISymbioteEvent,
  x: number,
  isRtl: boolean,
): number | undefined {
  if (!isRtl) return x;
  const contentLength = readContentLength(event, true);
  const viewportLength = readViewportLength(event, true);
  if (contentLength === undefined || viewportLength === undefined)
    return undefined;
  return flowRelativeScrollOffset(x, contentLength, viewportLength);
}

// The scroll content's size as `onContentSizeChange` reports it
export function contentSizeActionOf<ItemT>(
  width: number,
  height: number,
  horizontal: boolean,
): IListAction<ItemT> {
  const length = horizontal ? width : height;
  dlog(`VirtualizedList onContentSizeChange length=${length}`);
  return { kind: LIST_ACTION_KIND.contentSize, length };
}

export function layoutActionOf<ItemT>(
  event: ISymbioteEvent,
  horizontal: boolean,
): IListAction<ItemT> | undefined {
  const length = readLayoutLength(event, horizontal);
  if (length === undefined) return undefined;
  dlog(`VirtualizedList onLayout viewport=${length}`);
  return { kind: LIST_ACTION_KIND.layout, length };
}

export function measureActionOf<ItemT>(
  event: ISymbioteEvent,
  index: number,
  horizontal: boolean,
): IListAction<ItemT> | undefined {
  const length = readLayoutLength(event, horizontal);
  if (length === undefined) return undefined;
  const offset = readLayoutOffset(event, horizontal);
  dlog(
    `VirtualizedList cell ${index} measured length=${length} offset=${offset ?? 'none'}`,
  );
  return { kind: LIST_ACTION_KIND.measure, index, length, offset };
}

// Where a native scroll goes, clamped so a negative offset never reaches the host
export function scrollTargetOf(
  offset: number,
  horizontal: boolean,
): { x: number; y: number } {
  const clamped = Math.max(EMPTY_OFFSET, offset);
  return horizontal
    ? { x: clamped, y: EMPTY_OFFSET }
    : { x: EMPTY_OFFSET, y: clamped };
}

type IMergeSeparator = (
  gapIndex: number,
  patch: Partial<ISeparatorProps<never>>,
) => void;

// RN's `CellRenderer._separators` for the cell at `index`, `merge` writes onto one gap
export function buildSeparatorHandles(
  index: number,
  merge: IMergeSeparator,
): ISeparators {
  return {
    highlight: (): void => {
      dlog(`VirtualizedList separator highlight cell=${index}`);
      merge(index - 1, { highlighted: true });
      merge(index, { highlighted: true });
    },
    unhighlight: (): void => {
      dlog(`VirtualizedList separator unhighlight cell=${index}`);
      merge(index - 1, { highlighted: false });
      merge(index, { highlighted: false });
    },
    updateProps: (
      select: ISeparatorSide,
      newProps: Record<string, unknown>,
    ): void => {
      merge(select === SEPARATOR_SIDE.leading ? index - 1 : index, newProps);
    },
  };
}
