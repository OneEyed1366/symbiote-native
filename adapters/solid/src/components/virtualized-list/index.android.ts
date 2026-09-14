// VirtualizedList on Android. An Android ScrollView accepts only ONE child, so a RefreshControl
// cannot sit beside the content the way iOS allows ("addViewAt: failed to insert view … at index 1").
// Instead the RefreshControl (AndroidSwipeRefreshLayout) WRAPS the scroll host, which nests inside it
// so the inner scroll takes the gesture before the refresh parent — RN's own ScrollView.js android
// branch, decided by the `<scroll-view>` tag's own engine behavior registered for this platform
// (`core/components/src/behaviors/scroll-view/index.android.ts`). Metro picks this file on an
// Android host; no Platform.OS read. iOS and Android share one `createVirtualizedList` now — nothing
// here differs per platform any more except which file Metro resolves.

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
