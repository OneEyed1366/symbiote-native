// VirtualizedList on iOS. The RefreshControl (PullToRefreshView) is a CHILD of the scroll host,
// rendered as a childless SIBLING BEFORE the content container — RN ScrollView.js's
// `{refreshControl}{contentContainer}`, the same fact this adapter's ScrollView and adapters/react's,
// adapters/vue's and adapters/svelte's iOS bindings encode. Metro picks this file on an iOS host; no
// Platform.OS read.

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

export const VirtualizedList = createVirtualizedList({
  refreshControlMode: 'sibling',
});
