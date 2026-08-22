// The neutral type both platform files share, so neither `.ios.ts` nor `.android.ts` imports
// FROM the other — same convention as switch/switch-platform-types.ts.
export type IScrollViewHostPlatform = {
  // iOS: RefreshControl is a childless SIBLING of the content container, both inside the scroll
  // view (RN ScrollView.js: {refreshControl}{contentContainer}). Android: RefreshControl
  // (AndroidSwipeRefreshLayout) WRAPS the scroll view — an Android ScrollView hosts only one
  // child, so the scroll view nests INSIDE the refresh control instead of beside it.
  refreshControlMode: 'sibling' | 'wrap';
};
