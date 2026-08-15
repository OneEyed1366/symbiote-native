// ScrollView, Android platform mapping. An Android ScrollView accepts only ONE child, so
// RefreshControl (AndroidSwipeRefreshLayout) WRAPS the scroll view instead of sitting beside it —
// same fact adapters/react's and adapters/vue's scroll-view/index.android.ts encode.
import type { IScrollViewHostPlatform } from './scroll-view-platform-types';

export type { IScrollViewHostPlatform };

export const PLATFORM: IScrollViewHostPlatform = {
  refreshControlMode: 'wrap',
};
