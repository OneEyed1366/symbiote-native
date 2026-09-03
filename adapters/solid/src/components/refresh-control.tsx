// RefreshControl — the Solid lifecycle half, and there is barely any: the component owns one host
// tag and forwards its props onto it. On iOS `symbiote-refresh-control` resolves to Fabric's
// PullToRefreshView, which lives INSIDE a ScrollView as a childless sibling before the content
// container; on Android it is AndroidSwipeRefreshLayout and WRAPS the scroll view instead (an
// Android ScrollView hosts exactly one child). Which of the two shapes is built is ScrollView's
// job, not this file's — see scroll-view/shared.tsx's `refreshControlMode`.
//
// `refreshing` is a CONTROLLED prop: the parent owns it and pushes it down, and native reports the
// gesture back through the direct `topRefresh` event. `onRefresh` therefore rides in the forwarded
// bag untouched — routeProp asks the node's ViewConfig whether `onRefresh` is an event and attaches
// it as a listener, which is why nothing here inspects the `on` prefix itself
// (symbiote-engine-core §2).
//
// FLAT, not a folder: the file-layout rule gives a module its own folder only when it has real
// platform (`.ios`/`.android`) or `-shared` variants. There is no JS-side platform branch here —
// every prop forwards to the native node, which reads what it understands and ignores the rest, so
// the Android-only spinner props below are harmless on iOS and vice versa.

import { splitProps } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiote-native/components';
import { dlog, type IClassNameValue } from '@symbiote-native/engine';
import { withStableKeys } from '../utils/stable-keys';

// Declared here rather than imported from @symbiote-native/components: `children` is a framework
// value (Solid's JSX.Element), which is exactly the test <prop_types_split_agnostic_vs_per_adapter>
// applies — the agnostic FIELD BASE (IAccessibilityProps / IAriaProps) is shared, the
// framework-flavoured field is per-adapter. React's, Vue's and Svelte's are separate declarations
// for the same reason, and an adapter never imports another adapter's types.
export interface IRefreshControlProps extends IAccessibilityProps, IAriaProps {
  refreshing: boolean;
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
  // Solid's spelling for a registered class name, matching View / Switch / ScrollView (React's is
  // `className`). Resolved through the shared style registry by routeProp's class+style merge.
  class?: IClassNameValue;
  // Only ever filled on Android, where the scroll view nests inside this control. ScrollView does
  // that nesting imperatively (it receives an already-created element, and Solid has no
  // cloneElement / VNode re-invocation), so app code normally leaves this empty.
  children?: JSX.Element;
}

export function RefreshControl(props: IRefreshControlProps): JSX.Element {
  // `children` is pulled out rather than left in the bag: spread skips it anyway, but leaving it in
  // would make the bag accessor re-run whenever the child subtree changed. Same split View makes.
  const [local, rest] = splitProps(props, ['children']);

  // withStableKeys because resolveAccessibilityProps has two branches with DIFFERENT key sets — it
  // returns its input untouched while no aria-* alias holds a value, and a fully-blanked bag once
  // one does. Solid's `spread` walks only the current keys and has no removal pass, so a key that
  // vanishes would keep its last value on the native view forever
  // (.claude/rules/solid-descriptor-bridge.md §1).
  const bag = withStableKeys(() => ({ ...resolveAccessibilityProps(rest) }));

  dlog('RefreshControl -> PullToRefreshView');

  return (
    <symbiote-refresh-control {...bag()}>
      {local.children}
    </symbiote-refresh-control>
  );
}
