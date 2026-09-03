// `IRefreshControlProps`'s canonical home — see `view-props.ts`'s header comment for why this
// type lives in a plain `.ts` file rather than being re-exported straight out of
// `RefreshControl.svelte`. No shared core/components layer exists for RefreshControl (confirmed
// by inspecting the barrel) — mirrors React's/Vue's native prop surface directly. `onRefresh`
// rides the object bag as an idiomatic Svelte 5 callback prop (svelte-adapter-dom-shim skill
// §3g(c)), unlike Vue which re-wires it through a typed `refresh` emit.
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
  // view's resolved style onto this wrapper — see scroll-view/index.svelte.
  style?: IStyleProp<IViewStyle>;
  // On Android the RefreshControl WRAPS the ScrollView (host via this Snippet); on iOS it is a
  // childless sibling, so this is unused there — passing it through is harmless.
  children?: Snippet;
}
