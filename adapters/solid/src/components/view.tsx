// View — the Solid host primitive, and the file that fixes the children/ref idiom every other
// Solid component will copy.
//
// WHY THIS IS REAL JSX AND NOT A HAND-BUILT NODE. `symbiote-view` takes a live subtree of the
// user's components, and reducing that subtree to primitives IS Solid's reconciler. So the only
// two moving parts are (a) forwarding a prop bag onto one host element and (b) handing the
// children accessor to the renderer's `insert` — precisely what compiled JSX emits
// (`spread(el, mergeProps(bag), true)` + `insert(el, () => props.children)`, verified against
// babel-preset-solid's output). Writing those calls by hand would be the compiler's job done
// worse, and this is the file a Solid author reads first.
//
// There is NO renderView() in @symbiote-native/components, and there must not be
// (.claude/rules/component-render-fn-boundary.md). A render fn moves to core only when every
// input is a framework-agnostic VALUE; `children` is a live framework subtree that flows through
// the reconciler and is never converted back into a Descriptor. So descriptorToSolid has nothing
// to do here — View builds its host element directly, exactly as React's and Vue's do.
//
// NOTHING here destructures `props` at setup. Solid props are getters and a component body runs
// ONCE; splitProps is the idiomatic split that keeps the rest reactive, and every read of the
// remaining props happens inside the bag accessor, which `spread` re-runs as a render effect.

import { splitProps, type Ref } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
  type IResponderProps,
} from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IHostInstance } from '../host-instance';
import { applyHostRef } from '../utils/host-ref';
import { withStableKeys } from '../utils/stable-keys';

// Declared here, not imported from @symbiote-native/components, and not from another adapter.
// `children` (a Solid JSX.Element) and `ref` (solid-js's Ref union) are framework values, which
// is exactly the test <prop_types_split_agnostic_vs_per_adapter> applies: the agnostic FIELD BASE
// (IAccessibilityProps / IAriaProps / IResponderProps, IStyleProp, ISymbioteEvent) is shared, the
// framework-flavoured fields are per-adapter. React's IViewProps and Vue's are separate
// declarations for the same reason.
export interface IViewProps
  extends IAccessibilityProps, IAriaProps, IResponderProps {
  style?: IStyleProp<IViewStyle>;
  // Solid's own spelling for a registered class name — `class`, the attribute an author already
  // writes on a raw host intrinsic in examples/solid (React's is `className`). Resolved through
  // the shared style registry by routeProp's centralized class+style merge
  // (core/engine/src/node.ts), the same registry a compiled `.css` / `.module.css` registers
  // into. Explicit `style` always wins over a class-derived one, regardless of prop order.
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
  // RN's modern W3C alias for nativeID; folded below, never sent to Fabric raw.
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

export function View(props: IViewProps): JSX.Element {
  // `children` and `ref` are pulled out rather than left to ride in the bag. Both are skipped by
  // spreadExpression's prop loop anyway, but leaving them in would make the bag accessor depend on
  // the children subtree (recomputing every prop when only a child changed) and would put `ref`
  // behind spread's own ref effect, which re-runs — and so re-calls the caller's ref — on EVERY
  // prop change. React calls a ref once per attach; this keeps that contract.
  const [local, rest] = splitProps(props, ['children', 'ref', 'id']);

  // RN's modern `id` is a W3C-named alias for `nativeID`: View.js copies it over
  // (`processedProps.nativeID = id`), so `id` wins when both are set. Folded here, with the raw
  // `id` key dropped so it never reaches Fabric — every non-function prop otherwise passes
  // through to the slot untouched. `nativeID` is emitted UNCONDITIONALLY (undefined when neither
  // is set) rather than conditionally like React's resolveId: a key that appears and disappears
  // between runs is the exact hazard withStableKeys exists for, and not creating it is cheaper
  // than widening it back.
  const bag = withStableKeys(() => ({
    ...resolveAccessibilityProps(rest),
    nativeID: local.id ?? rest.nativeID,
  }));

  const attachRef = (node: IHostInstance): void => {
    applyHostRef(local.ref, node);
  };

  return (
    <symbiote-view ref={attachRef} {...bag()}>
      {local.children}
    </symbiote-view>
  );
}
