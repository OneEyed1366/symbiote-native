// The `<refresh-control>` tag's prop surface. The wrapper is gone: it forwarded every prop and
// turned the host's `onRefresh` into a typed `refresh` emit, which a tag needs no help with —
// `@refresh` compiles to an `onRefresh` prop and `routeProp` sends it to the native `topRefresh`
// event. The controlled-spinner handshake lives in `registerRefreshControlBehavior`.
//
// Where the node SITS is still the parent's decision and differs per platform: on iOS a
// PullToRefreshView sibling inside the ScrollView, on Android an AndroidSwipeRefreshLayout wrapping
// it. `registerScrollViewBehavior` claims the tag and places it.

import type { IClassNameValue } from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';

export interface IRefreshControlProps extends IAccessibilityProps, IAriaProps {
  refreshing: boolean;
  // RN's W3C alias for `nativeID`, folded by the spec entry's ID_ALIAS.
  id?: string;
  tintColor?: string;
  title?: string;
  titleColor?: string;
  progressViewOffset?: number;
  // Android-only spinner styling: `colors` are the indicator's animated stroke colors,
  // `progressBackgroundColor` the disc behind it, `size` the diameter preset.
  colors?: readonly string[];
  progressBackgroundColor?: string;
  size?: 'default' | 'large';
  // Android-only; iOS native never reads it.
  enabled?: boolean;
  class?: IClassNameValue;
}
