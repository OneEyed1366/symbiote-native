// The prop surface of `<refresh-control>`, for React.
//
// No component left to type — the element IS the tag. The wrapper was a passthrough plus the aria
// fold (now the engine's `fabricProps`); the controlled-spinner handshake — mirror what native last
// reported, command it back down when the app's `refreshing` disagrees, RefreshControl.js:145-166 —
// lives in `core/components/src/behaviors/refresh-control.ts`, wired by `../register`. This stays
// exported because an app that wraps the tag in its own component types the bag it forwards against
// something.
//
// `children` keeps this per-adapter rather than shared: it is a React `ReactNode`
// (<prop_types_split_agnostic_vs_per_adapter>).
import type { ReactNode } from 'react';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';

export interface IRefreshControlProps extends IAccessibilityProps, IAriaProps {
  refreshing: boolean;
  // RN's W3C-named alias for `nativeID`, folded by the spec entry's ID_ALIAS. Upstream spreads
  // `...ViewProps` (RefreshControl.js:70), so RN accepts it.
  id?: string;
  // RN's onRefresh is `() => void | Promise<void>`, so the handler may be async; the promise is
  // fire-and-forget (native already starts refreshing on the gesture).
  onRefresh?: () => void | Promise<void>;
  tintColor?: string;
  title?: string;
  titleColor?: string;
  progressViewOffset?: number;
  // Android-only spinner styling (RefreshControl.js:44-55): `colors` are the indicator's animated
  // stroke colors, `progressBackgroundColor` the disc behind it, `size` the diameter preset.
  // PullToRefreshView on iOS ignores them, so forwarding is harmless there.
  colors?: readonly string[];
  progressBackgroundColor?: string;
  size?: 'default' | 'large';
  // Android-only native prop. RN's iOS branch (RefreshControl.js:165) destructures it OUT before
  // spreading, so iOS native never reads it; Android's (`:174`) forwards it to
  // AndroidSwipeRefreshLayout.
  enabled?: boolean;
  // On Android the RefreshControl WRAPS the ScrollView, so it receives the scroll view as its
  // child; on iOS it is a childless sibling and this is undefined.
  children?: ReactNode;
  className?: string;
}
