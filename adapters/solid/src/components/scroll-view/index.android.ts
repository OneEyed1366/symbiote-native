// ScrollView on Android. An Android ScrollView accepts only ONE child, so a RefreshControl cannot
// sit beside the content the way iOS allows ("addViewAt: failed to insert view … at index 1").
// Instead the RefreshControl (AndroidSwipeRefreshLayout) WRAPS the scroll view, which nests inside
// it with nestedScrollEnabled so the inner scroll takes the gesture before the refresh parent —
// RN's own ScrollView.js android branch, and the same fact adapters/react's, adapters/vue's and
// adapters/svelte's Android bindings encode. Metro picks this file on an Android host; no
// Platform.OS read.

import { createScrollView } from './shared';

export type {
  IScrollViewProps,
  IScrollViewHandle,
  IScrollViewHostPlatform,
  IStickyHeaderComponentType,
  IStickyHeaderComponentProps,
} from './shared';

export const ScrollView = createScrollView({
  refreshControlMode: 'wrap',
});
