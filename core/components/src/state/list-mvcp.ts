// RN's `getDerivedStateFromProps` for `maintainVisibleContentPosition`
// A changed item count moves the render window with the anchor key, so the cells native anchors
// on stay mounted, and the list waits for the scroll event native MVCP sends

import { dlog } from '@symbiote-native/engine';
import { NO_INDEX } from './list-constants';
import { keyForOf } from './list-keys';
import type { IListReducerInputs, IListState } from './list-reducer-types';

// The hint is where a pure prepend would have put the key
function indexOfKey(
  keyFor: (index: number) => string,
  count: number,
  key: string,
  hint: number,
): number {
  if (hint >= 0 && hint < count && keyFor(hint) === key) return hint;
  for (let index = 0; index < count; index += 1) {
    if (keyFor(index) === key) return index;
  }
  return NO_INDEX;
}

// Tracks the key at `minIndexForVisible`, and shifts the committed window by where the previous
// key went. RN acts only when the item count changed
export function trackAnchorKey<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  count: number,
): void {
  const mvcp = inputs.maintainVisibleContentPosition;
  if (mvcp === undefined) return;
  const minIndex = mvcp.minIndexForVisible;
  const previousCount = state.metrics.count;
  if (state.isWindowSeeded && count === previousCount) return;
  const keyFor = keyForOf(inputs);
  const previousKey = state.firstVisibleKey;
  const nextKey = count > minIndex ? keyFor(minIndex) : null;
  state.firstVisibleKey = nextKey;
  if (!state.isWindowSeeded || previousKey === null || nextKey === null) return;
  if (nextKey === previousKey) return;
  const index = indexOfKey(
    keyFor,
    count,
    previousKey,
    count - previousCount + minIndex,
  );
  if (index === NO_INDEX) return;
  const adjustment = index - minIndex;
  const { first, last } = state.committedWindow;
  state.committedWindow = {
    first: first + adjustment,
    last: last + adjustment,
  };
  state.pendingScrollUpdates += 1;
  dlog(
    `VirtualizedList MVCP window ${adjustment} ` +
      `(anchor "${previousKey}" moved to ${index})`,
  );
}
