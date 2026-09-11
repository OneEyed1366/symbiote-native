// `IRefreshControlProps`'s canonical home. `RefreshControl` is a bare `<refresh-control>` TAG now
// (deleted 2026-09-10 — the wrapper was a pure passthrough), so this type has no component to be
// re-exported from at all. `onRefresh` rides the `p={{}}` bag as an idiomatic Svelte 5 callback
// prop (svelte-adapter-dom-shim skill §3g(c)), unlike Vue which re-wires it through a typed
// `refresh` emit.
import type { Snippet } from 'svelte';
import type {
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type { ISvelteClassValue } from '../class-value';

export interface IRefreshControlProps extends IAccessibilityProps, IAriaProps {
  refreshing: boolean;
  // `id` — RN's W3C alias for `nativeID`, folded by the spec entry's ID_ALIAS. See React's
  // declaration for why the prop and the alias land together.
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
  // preset. AndroidSwipeRefreshLayout reads them; PullToRefreshView ignores unknown props.
  colors?: readonly string[];
  progressBackgroundColor?: string;
  size?: 'default' | 'large';
  // Android-only native prop forwarded to AndroidSwipeRefreshLayout; iOS native never reads it.
  enabled?: boolean;
  class?: ISvelteClassValue;
  // ScrollView's Android wrap mode (splitLayoutProps) routes the LAYOUT half of the scroll
  // view's resolved style onto this wrapper — see behaviors/scroll-view/index.android.ts.
  style?: IStyleProp<IViewStyle>;
  // On Android the RefreshControl WRAPS the ScrollView (host via this Snippet); on iOS it is a
  // childless sibling, so this is unused there — passing it through is harmless.
  children?: Snippet;
}
