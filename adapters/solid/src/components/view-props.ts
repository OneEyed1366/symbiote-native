// The `<view>` tag's prop surface. The wrapper is gone: it forwarded a bag onto one host element
// and did two folds, both of which now run below the adapter — `id -> nativeID` in the renderer's
// `foldAliasKey` (which covers `createElement` and every later prop write, not just the wrapper's
// one path) and the aria/role fold in the engine's `fabricProps`.
//
// ONE THING THE WRAPPER DID IS NOT INHERITED, and a consumer that builds a whole bag has to do it
// itself: `withStableKeys`. Solid's `spread` walks only the CURRENT key set and has no removal
// pass, so a key that stops being emitted keeps its last value on the native view forever
// (`.claude/rules/solid-descriptor-bridge.md` §1). A bag whose keys are all statically present —
// an ordinary attribute list, a `splitProps` rest proxy — is unaffected.

import type { Ref } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import type {
  IAccessibilityProps,
  IAriaProps,
  IResponderProps,
} from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IHostInstance } from '../host-instance';

// Declared here, not imported from @symbiote-native/components, and not from another adapter.
// `children` (a Solid JSX.Element) and `ref` (solid-js's Ref union) are framework values, which
// is exactly the test <prop_types_split_agnostic_vs_per_adapter> applies: the agnostic FIELD BASE
// (IAccessibilityProps / IAriaProps / IResponderProps, IStyleProp, ISymbioteEvent) is shared, the
// framework-flavoured fields are per-adapter.
export interface IViewProps
  extends IAccessibilityProps, IAriaProps, IResponderProps {
  style?: IStyleProp<IViewStyle>;
  // Solid's own spelling for a registered class name — `class`, the attribute an author already
  // writes on a raw host intrinsic (React's is `className`). Resolved through the shared style
  // registry by routeProp's centralized class+style merge (core/engine/src/node.ts). Explicit
  // `style` always wins over a class-derived one, regardless of prop order.
  class?: IClassNameValue;
  onPress?: (event: ISymbioteEvent) => void;
  // Touch lifecycle around a press, synthesized from the touch stream by the engine's events
  // layer, mirroring RN's Pressability: onPressIn on touch-down, onPressOut on release.
  onPressIn?: (event: ISymbioteEvent) => void;
  onPressOut?: (event: ISymbioteEvent) => void;
  // Fires with the measured frame once Fabric lays the view out. A listener also raises the
  // onLayout flag prop so native actually measures.
  onLayout?: (event: ISymbioteEvent) => void;
  // Bubbling focus/blur (RN's FocusEventProps), declared on the base View so any view emits
  // them; registered in the engine's view-config BASE_EVENTS.
  onFocus?: (event: ISymbioteEvent) => void;
  onBlur?: (event: ISymbioteEvent) => void;
  // Gate touch handling without changing layout: 'none' lets touches fall through, 'box-none'
  // makes the view itself transparent to touches but not its children.
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  // Enlarge the touch target past the view's visual bounds without affecting layout.
  hitSlop?:
    number | { top?: number; left?: number; bottom?: number; right?: number };
  // testID / nativeID are inherited from IAccessibilityProps (the shared host-anchor base).
  // RN's modern W3C alias for nativeID; folded in the renderer, never sent to Fabric raw.
  id?: string;
  focusable?: boolean;
  // Yoga collapses a non-interactive view into its parent unless this is false.
  collapsable?: boolean;
  removeClippedSubviews?: boolean;
  renderToHardwareTextureAndroid?: boolean;
  shouldRasterizeIOS?: boolean;
  needsOffscreenAlphaCompositing?: boolean;
  ref?: Ref<IHostInstance>;
  children?: JSX.Element;
}
