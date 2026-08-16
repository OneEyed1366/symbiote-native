// ActivityIndicator on Android: AndroidProgressBar needs `styleAttr` (it drives its setStyle();
// without it the view throws "setStyle() not called") plus `indeterminate: true`, and its default
// color is the theme (null) — same facts adapters/react's and adapters/vue's Android bindings
// encode. Metro picks this on an Android host; no Platform.OS read.
import type { IActivityIndicatorPlatform } from '@symbiote-native/components';

export type { IActivityIndicatorPlatform };

export const PLATFORM: IActivityIndicatorPlatform = {
  // RN: `color = Platform.OS === 'ios' ? GRAY : null`. Android lets the theme color it.
  defaultColor: null,
  nativeExtras: { styleAttr: 'Normal', indeterminate: true },
};
