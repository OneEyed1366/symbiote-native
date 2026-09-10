// VirtualizedList on iOS. The RefreshControl (PullToRefreshView) is a CHILD of the scroll host,
// rendered as a childless SIBLING BEFORE the content container — RN ScrollView.js's
// `{refreshControl}{contentContainer}`, decided by the `<scroll-view>` tag's own engine behavior
// registered for this platform (`core/components/src/behaviors/scroll-view/index.ios.ts`), the same
// one every other adapter's iOS binding registers. Metro picks this file on an iOS host; no
// Platform.OS read. iOS and Android share one `createVirtualizedList` now — nothing here differs
// per platform any more except which file Metro resolves.

import { createVirtualizedList } from './shared';

export type {
  IVirtualizedListProps,
  IVirtualizedListComponent,
  IVirtualizedListCellInfo,
  IVirtualizedListRenderItem,
  IVirtualizedListHandle,
  ICellLayout,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
} from './shared';

export const VirtualizedList = createVirtualizedList();
