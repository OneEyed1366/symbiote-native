// The `<refresh-control>` tag's prop surface. On iOS the tag resolves to Fabric's PullToRefreshView,
// which lives INSIDE a scroll view as a childless sibling before the content container; on Android it
// is AndroidSwipeRefreshLayout and WRAPS the scroll view instead. Which shape is built is the scroll
// view's job, and the controlled-spinner handshake — mirror what native reported, command the value
// back down when the app's `refreshing` disagrees — is the tag's own behavior
// (`registerRefreshControlBehavior`, wired by `../register`).

import type { JSX } from '../jsx-runtime';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type { IClassNameValue } from '@symbiote-native/engine';

// Declared here rather than imported from @symbiote-native/components: `children` is a framework
// value (Solid's JSX.Element), which is exactly the test <prop_types_split_agnostic_vs_per_adapter>
// applies — the agnostic FIELD BASE (IAccessibilityProps / IAriaProps) is shared, the
// framework-flavoured field is per-adapter.
export interface IRefreshControlProps extends IAccessibilityProps, IAriaProps {
  refreshing: boolean;
  // RN's W3C alias for `nativeID`, folded by the spec entry's ID_ALIAS.
  id?: string;
  // RN types this `() => void | Promise<void>` — the handler may be async, and the promise is
  // fire-and-forget because native has already started refreshing off the gesture.
  onRefresh?: () => void | Promise<void>;
  tintColor?: string;
  title?: string;
  titleColor?: string;
  progressViewOffset?: number;
  // Android-only spinner styling (RN RefreshControlPropsAndroid): `colors` are the indicator's
  // animated stroke colors, `progressBackgroundColor` the disc behind it, `size` the diameter
  // preset. AndroidSwipeRefreshLayout reads them; PullToRefreshView ignores them.
  colors?: readonly string[];
  progressBackgroundColor?: string;
  size?: 'default' | 'large';
  // Android-only. RN's iOS branch destructures `enabled` OUT before spreading to PullToRefreshView,
  // so iOS native never reads it; forwarding it anyway is harmless, like the props above.
  enabled?: boolean;
  // Solid's spelling for a registered class name (React's is `className`). Resolved through the
  // shared style registry by routeProp's class+style merge.
  class?: IClassNameValue;
  // Only ever filled on Android, where the scroll view nests inside this control.
  children?: JSX.Element;
}
