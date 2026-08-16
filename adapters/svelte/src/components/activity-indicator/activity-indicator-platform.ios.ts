// ActivityIndicator on iOS: RCTActivityIndicatorView takes the size enum + a GRAY default color
// and no extra native props — same facts adapters/react's and adapters/vue's iOS bindings encode.
// IActivityIndicatorPlatform is already framework-agnostic (no ref/children), so it is imported
// verbatim from @symbiote-native/components rather than re-declared here.
import type { IActivityIndicatorPlatform } from '@symbiote-native/components';

export type { IActivityIndicatorPlatform };

// RN's iOS default spinner color (Libraries/.../ActivityIndicator.js GRAY).
const IOS_DEFAULT_COLOR = '#999999';

export const PLATFORM: IActivityIndicatorPlatform = {
  defaultColor: IOS_DEFAULT_COLOR,
  nativeExtras: {},
};
