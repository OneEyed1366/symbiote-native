// The `<refresh-control>` tag's prop surface. The tag is matched by `RefreshControlElement`
// (`../elements`) and carries the controlled-spinner handshake as an engine behavior
// (`registerRefreshControlBehavior` — mirror what native last reported, command it back when the
// app's `refreshing` disagrees, RefreshControl.js:145-166), so the wrapper that ran that in Angular
// was deleted 2026-09-11.
//
// WHERE it goes is the ScrollView's decision, not this tag's: write it as an ordinary FIRST CHILD
// on both platforms and the scroll-view behavior re-parents it — iOS a sibling before the content
// container, Android the `AndroidSwipeRefreshLayout` WRAPPING the scroll view.
//
// The type stays for a component forwarding a bag, and because `IAngularRefreshControlProps` is
// public API.

import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';

export interface IAngularRefreshControlProps
  extends IAccessibilityProps, IAriaProps {
  refreshing: boolean;
  // `id` — RN's W3C alias for `nativeID`, folded by the spec entry's ID_ALIAS.
  id?: string;
  // RN's onRefresh is `() => void | Promise<void>`, the handler may be async; the promise is
  // fire-and-forget (native already starts refreshing on the gesture).
  onRefresh?: () => void | Promise<void>;
  tintColor?: string;
  title?: string;
  titleColor?: string;
  progressViewOffset?: number;
  // Android-only spinner styling (RN RefreshControlPropsAndroid): `colors` are the indicator's
  // animated stroke colors, `progressBackgroundColor` the disc behind it, `size` the diameter
  // preset. AndroidSwipeRefreshLayout reads them; PullToRefreshView on iOS ignores unknown props.
  colors?: readonly string[];
  progressBackgroundColor?: string;
  size?: 'default' | 'large';
  // Android-only native prop forwarded to AndroidSwipeRefreshLayout; iOS native never reads it.
  enabled?: boolean;
  // The Android scroll-view wrap injects the layout half of the style onto this host; iOS leaves it
  // unset (the RefreshControl is a childless sibling). Harmless to forward on both.
  style?: IStyleProp<IViewStyle>;
}
