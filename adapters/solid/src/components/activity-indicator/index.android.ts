// ActivityIndicator on Android: AndroidProgressBar needs `styleAttr` (it drives its setStyle();
// without it the view throws "setStyle() not called") plus `indeterminate: true`, and its default
// color is the theme (null), which the render fn turns into an OMITTED color prop — a literal null
// would be rejected by Fabric's color parser. Same facts the other adapters' Android bindings
// encode. Metro picks this on an Android host; no Platform.OS read.

import { createActivityIndicator } from './shared';

export type { IActivityIndicatorProps, IActivityIndicatorSize } from './shared';

export const ActivityIndicator = createActivityIndicator({
  // RN: `color = Platform.OS === 'ios' ? GRAY : null`; Android lets the theme color it.
  defaultColor: null,
  nativeExtras: { styleAttr: 'Normal', indeterminate: true },
});
