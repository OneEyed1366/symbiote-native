// ScrollView on iOS. The RefreshControl (PullToRefreshView) is a CHILD of the scroll view, rendered
// as a childless SIBLING BEFORE the content container — RN ScrollView.js's
// `{refreshControl}{contentContainer}`, the same fact adapters/react's, adapters/vue's and
// adapters/svelte's iOS bindings encode. Metro picks this file on an iOS host; no Platform.OS read.

import { createScrollView } from './shared';

export type {
  IScrollViewProps,
  IScrollViewHandle,
  IScrollViewHostPlatform,
  IStickyHeaderComponentType,
  IStickyHeaderComponentProps,
} from './shared';

export const ScrollView = createScrollView({
  refreshControlMode: 'sibling',
});
