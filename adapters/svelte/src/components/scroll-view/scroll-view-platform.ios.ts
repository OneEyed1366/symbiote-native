// ScrollView, iOS platform mapping. RefreshControl is a CHILD of the scroll view, rendered as a
// SIBLING BEFORE the content container (RN ScrollView.js: {refreshControl}{contentContainer}) —
// same fact adapters/react's and adapters/vue's scroll-view/index.ios.ts encode.
import type { IScrollViewHostPlatform } from './scroll-view-platform-types';

export type { IScrollViewHostPlatform };

export const PLATFORM: IScrollViewHostPlatform = {
  refreshControlMode: 'sibling',
};
