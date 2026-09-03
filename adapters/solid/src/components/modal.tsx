// Modal — the Solid lifecycle half. RCTModalHostView is an ordinary Fabric host node committing
// through the SAME childSet as the rest of the tree (no second JS surface, no portal). The style
// math (the backdrop override, the container/host styles, the presentationStyle default), the
// visible gate, and the keep-alive reducer all live framework-agnostic in
// @symbiote-native/components (state/modal.ts + view/render-modal.ts) and are shared verbatim with
// React, Vue and Svelte. Solid supplies only the reactivity: a signal over the keep-alive state, a
// post-render effect driving the visible→hidden transition, and the two host tags renderModal's
// fixed shape resolves to.
//
// A FLAT FILE, not a folder: Modal has no platform variant to select by filename. Every platform
// difference it carries is a PROP (supportedOrientations/allowSwipeDismissal are iOS-read,
// hardwareAccelerated/statusBarTranslucent/navigationBarTranslucent Android-read) forwarded by name
// to the one host, exactly as React's, Vue's and Svelte's single-file Modals do — unlike Switch,
// whose native prop NAMES and snap-back command genuinely differ per host (symbiote-file-layout:
// only a real platform/shared group gets a folder).
//
// WHY HAND-AUTHORED JSX AND NOT descriptorToSolid. Modal takes `children` — a live subtree of the
// user's components, which is the case the render-fn boundary rules OUT of core
// (.claude/rules/component-render-fn-boundary.md), so the bridge would have nothing to do with the
// half that matters and would hand back a root whose container child we would then have to reach
// into to `insert` into. renderModal always paints the SAME two-tag shape (one symbiote-modal host
// wrapping one collapsable symbiote-view container; only prop VALUES vary), so the tags are written
// out and the computed props read off the fixed positions — the same call React's createElement
// chain, Vue's h() chain and Svelte's markup all make. `children` then reaches the container
// through the compiler's own `insert`, which is the point of view.tsx's header.
//
// `Show` IS IMPORTED FROM solid-js ON PURPOSE. babel-preset-solid resolves an un-imported control-
// flow name against the renderer module instead, and renderer.ts exports no `Show` — the bundle
// still builds and `createComponent(undefined, …)` throws at RUNTIME, far from the JSX that caused
// it (.claude/rules/solid-descriptor-bridge.md §3).
//
// NOTHING here destructures `props`. Solid props are getters and a component body runs ONCE; every
// read below sits inside an accessor or an effect. The single deliberate exception is the reducer
// SEED, which is a mount-time value by definition (React's useReducer lazy init and Svelte's
// $state(...) initializer read it exactly once too).

import { createEffect, createSignal, Show, splitProps } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import {
  createDescriptorShapeGuard,
  createInitialModalState,
  modalReducer,
  renderModal,
  resolveAccessibilityProps,
  shouldRenderModal,
  type IAccessibilityProps,
  type IAriaProps,
  type IDescriptor,
  type IModalAnimationType,
  type IModalOrientation,
  type IModalPresentationStyle,
  type IModalState,
} from '@symbiote-native/components';
import {
  dlog,
  type IClassNameValue,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import { withStableKeys } from '../utils/stable-keys';

export type {
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
  IModalOrientationChangeEvent,
} from '@symbiote-native/components';

// Declared here, not imported from @symbiote-native/components and never from another adapter:
// `children` is a framework value, which is exactly the test
// <prop_types_split_agnostic_vs_per_adapter> applies — the agnostic FIELD BASE
// (IAccessibilityProps / IAriaProps, IStyleProp, ISymbioteEvent, and the four IModal* detail types
// re-exported verbatim above) is shared, the framework-flavoured field is per-adapter. React's,
// Vue's and Svelte's IModalProps are separate declarations for the same reason.
export interface IModalProps extends IAccessibilityProps, IAriaProps {
  visible?: boolean;
  transparent?: boolean;
  backdropColor?: string;
  animationType?: IModalAnimationType;
  presentationStyle?: IModalPresentationStyle;
  supportedOrientations?: ReadonlyArray<IModalOrientation>;
  hardwareAccelerated?: boolean;
  // navigationBarTranslucent makes the Android nav bar translucent; RN requires
  // statusBarTranslucent true alongside it (Modal.js ~172 / confirmProps ~193).
  statusBarTranslucent?: boolean;
  navigationBarTranslucent?: boolean;
  // allowSwipeDismissal lets a swipe-down dismiss the modal on iOS; RN pairs it with
  // onRequestClose to handle the dismissal (Modal.js ~155).
  allowSwipeDismissal?: boolean;
  // Real ViewConfig DirectEvents — they ride `passthrough` onto the host node raw, not through any
  // JS synthesis, so routeProp attaches them from the ModalHostView ViewConfig.
  onShow?: () => void;
  onDismiss?: () => void;
  onRequestClose?: () => void;
  // The engine hands every listener the ISymbioteEvent wrapper, so the orientation is read at
  // event.nativeEvent.orientation (IModalOrientationChangeEvent describes that payload).
  onOrientationChange?: (event: ISymbioteEvent) => void;
  style?: IStyleProp<IViewStyle>;
  // Like `style`, targets the CONTAINER View renderModal wraps the children in, not the outer
  // symbiote-modal host — the same split React's className and Vue's/Svelte's class apply. Solid's
  // spelling is `class`, matching View, Text, Pressable and Switch.
  class?: IClassNameValue;
  children?: JSX.Element;
}

// Read by Modal itself; everything else (the four DirectEvents, testID/nativeID, every
// accessibility* and aria-* field) forwards onto the host node through `passthrough`, exactly as
// React's `...passthrough` rest does.
const HANDLED_PROPS = [
  'visible',
  'transparent',
  'backdropColor',
  'animationType',
  'presentationStyle',
  'supportedOrientations',
  'hardwareAccelerated',
  'statusBarTranslucent',
  'navigationBarTranslucent',
  'allowSwipeDismissal',
  'style',
  'class',
  'children',
] as const;

const shape = createDescriptorShapeGuard('Modal');

export function Modal(props: IModalProps): JSX.Element {
  const [local, rest] = splitProps(props, HANDLED_PROPS);

  const isVisible = (): boolean => local.visible === true;

  // The keep-alive seed is a mount-time value by contract (createInitialModalState: a modal that
  // starts visible is rendered, one that starts hidden contributes no node), so this one read
  // outside an accessor is correct rather than the frozen-props bug.
  const [state, setState] = createSignal<IModalState>(
    createInitialModalState(isVisible()),
  );

  // createEffect, not createRenderEffect: it runs AFTER the render that used the OLD state, which
  // is the position React's useEffect, Vue's flush:'post' watch and Svelte's $effect all occupy —
  // so a visible→hidden transition renders once more with isRendered still true (the keep-alive
  // frame) before this drops it. A render effect would unmount immediately and kill the keep-alive.
  // The reducer is identity-stable, so the mount run and any no-op transition write the same object
  // back and nothing downstream recomputes.
  //
  // As on Svelte, and for the same reason: under this adapter's microtask-coalesced requestCommit()
  // the whole cascade settles inside one flush, so the keep-alive frame is real but never lands as
  // its own Fabric commit the way React's synchronous per-render commit makes it.
  createEffect(() => {
    setState(current =>
      modalReducer(current, isVisible() ? { type: 'show' } : { type: 'hide' }),
    );
  });

  const shouldRender = (): boolean => shouldRenderModal(isVisible(), state());

  createEffect(() => {
    if (!shouldRender()) dlog('Modal hidden -> no node committed');
  });

  // A plain accessor rather than a createMemo, unlike descriptor-to-solid.ts. A memo runs EAGERLY
  // at creation, which would paint a descriptor (and emit renderModal's "committing" dlog) for a
  // modal that is hidden and commits nothing. Read from inside the two `spread` render effects
  // instead, it never runs at all while `Show` is closed; the cost is that a change recomputes this
  // pure object literal twice, once per bag.
  const descriptor = (): IDescriptor =>
    renderModal({
      visible: local.visible,
      transparent: local.transparent,
      backdropColor: local.backdropColor,
      animationType: local.animationType,
      presentationStyle: local.presentationStyle,
      supportedOrientations: local.supportedOrientations,
      hardwareAccelerated: local.hardwareAccelerated,
      statusBarTranslucent: local.statusBarTranslucent,
      navigationBarTranslucent: local.navigationBarTranslucent,
      allowSwipeDismissal: local.allowSwipeDismissal,
      style: local.style,
      passthrough: resolveAccessibilityProps(rest),
    });

  // root = symbiote-modal > [container]; the user children nest UNDER the container View, never as
  // a direct sibling of the host (RN's modal content layout, render-modal.ts).
  const container = (): IDescriptor => {
    const [first] = descriptor().children;
    if (first === undefined)
      throw shape.error('the container child disappeared');
    return shape.asElement(first);
  };

  // withStableKeys on both bags because `passthrough` goes through resolveAccessibilityProps, whose
  // two branches emit DIFFERENT key sets — and Solid's `spread` walks only the CURRENT keys with no
  // removal pass, so a vanished key would keep its last value on the native view forever
  // (.claude/rules/solid-descriptor-bridge.md §1).
  const hostBag = withStableKeys(() => descriptor().props);
  const containerBag = withStableKeys(() => ({
    ...container().props,
    class: local.class,
  }));

  return (
    <Show when={shouldRender()}>
      <symbiote-modal {...hostBag()}>
        <symbiote-view {...containerBag()}>{local.children}</symbiote-view>
      </symbiote-modal>
    </Show>
  );
}
