// ActivityIndicator on iOS: RCTActivityIndicatorView takes the size enum plus a GRAY default color
// and no extra native props — the same facts adapters/react's, adapters/vue's and adapters/svelte's
// iOS bindings encode. Metro selects this file on an iOS host, no Platform.OS read.

import { createActivityIndicator } from './shared';

export type { IActivityIndicatorProps, IActivityIndicatorSize } from './shared';

// RN's iOS default spinner color (Libraries/.../ActivityIndicator.js GRAY).
const IOS_DEFAULT_COLOR = '#999999';

export const ActivityIndicator = createActivityIndicator({
  defaultColor: IOS_DEFAULT_COLOR,
  nativeExtras: {},
});
