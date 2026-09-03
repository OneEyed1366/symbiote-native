// createAnimatedComponent for @symbiote-native/solid: wraps a base component so its props may
// carry AnimatedNodes. The Solid twin of adapters/{react,vue}/src/modules/animated/
// create-animated-component; grown from components/scroll-view/animated-host.tsx, which was the
// same body pinned to `symbiote-view` and is absorbed by this file.
//
// A GENERIC WRAP IS POSSIBLE HERE, unlike Svelte. A Solid component is a plain function and
// `createComponent(Comp, props)` is an ordinary runtime call over any component reference — the
// same call compiled JSX itself emits. Svelte's four hand-authored .svelte files exist because a
// compiled Svelte component is not invocable that way; Angular's six explicit @Components exist
// because AOT-under-Metro ships no JIT. Neither constraint applies.
//
// The per-FRAME path never comes through here: value.setValue / animation -> flushValue ->
// AnimatedProps.update() -> setNativeProps(node). Under the native driver not even that runs — the
// UI thread owns the props once the leaf is connected to the view tag. This wrap only supplies the
// DECLARATIVE bag (animated nodes replaced by their current values) so first paint and every
// non-animated recompute carry concrete numbers.
//
// THE COMMIT-TIMING TRAP IS LIVE HERE. This adapter commits through `requestCommit()`, which is
// microtask-coalesced, so a mount-time effect runs BEFORE the node has a Fabric tag and the native
// half of the reconcile would silently no-op. `whenCommitted` is the retry seam (Angular passes the
// same thing for the same reason). Only the NATIVE half is deferred — the leaf is always built and
// attached to the value graph synchronously, because a deferred build sits behind a canceller the
// next reconcile drops.

import {
  createEffect,
  mergeProps,
  onCleanup,
  splitProps,
  type Component,
  type Ref,
} from 'solid-js';
import {
  createAnimatedLeafLifecycle,
  isNativeAnimatedAvailable,
  isSymbioteNode,
  readPassthroughStyle,
  reduceProps,
  resolveHostNode,
  whenCommitted,
} from '@symbiote-native/engine';
import type { JSX } from '../../jsx-runtime';
import { createElement, spread } from '../../renderer';
import { withStableKeys } from '../../utils/stable-keys';

// RN's prop carrying already-rasterized values that OVERRIDE the animated prop in the committed
// props, so the ShadowTree (hit-testing) stays current while the native driver animates.
const PASSTHROUGH_PROP = 'passthroughAnimatedPropExplicitValues';

export interface IAnimatedComponentProps {
  // `unknown`, not IStyleProp<IViewStyle>: an animated style holds live graph nodes where the
  // static type wants numbers (`transform: [{ translateY: <AnimatedInterpolation> }]`). RN's own
  // Animated.View types it the same way, which is what lets an interpolation through with no cast.
  style?: unknown;
  // Ref<unknown> because the base component decides what a ref receives — View hands back the host
  // node, ScrollView/FlatList/SectionList an imperative handle. The caller's ref gets the ORIGINAL
  // instance; only the leaf sees the resolved node.
  ref?: Ref<unknown>;
  passthroughAnimatedPropExplicitValues?: unknown;
  children?: JSX.Element;
  [key: string]: unknown;
}

// `Component<any>` is solid-js's own shape for "any component" (it is what ValidComponent is built
// from). A precise generic cannot work: the bag handed to the base is assembled at RUNTIME from a
// key set that grows, so no static prop type describes it. The RETURN type stays precise, so a
// caller of Animated.View still gets a real prop type.
// `Base` accepts a TAG as well as a component, and the string branch is not symmetry — it is the
// only shape that works once a primitive becomes a public intrinsic. `<Base {...props} />` on a
// capitalized identifier compiles to `createComponent(Base, …)`, which is `untrack(() => Comp(props))`
// in solid-js, so a string base is a `TypeError: Comp is not a function` at first paint. There is
// nothing to widen INTO either: `createRenderer()` from solid-js/universal returns twelve names and
// `Dynamic` is not among them (solid-js/web's Dynamic is DOM-only), so the element has to be built
// through this renderer's own createElement + spread — the same two calls solid's own Dynamic makes
// on its string branch. `spread` handles `ref` and `children` itself (universal's spreadExpression
// skips both in its prop loop and drives them separately), which is why nothing is threaded by hand.
export function createAnimatedComponent(
  Base: Component<any> | string,
): (props: IAnimatedComponentProps) => JSX.Element {
  return function AnimatedComponent(
    props: IAnimatedComponentProps,
  ): JSX.Element {
    // The passthrough is CONSUMED (it only overrides the committed style below); `children` and
    // `ref` are pulled out so the bag accessor depends on neither the child subtree nor the ref.
    const [local, rest] = splitProps(props, [
      'ref',
      'children',
      PASSTHROUGH_PROP,
    ]);

    // Held by IDENTITY in a plain variable — never a signal, never a store. The engine's commit
    // mirror is a WeakMap keyed on the raw node, so any proxy wrapper becomes a different key and
    // every native bind silently misses (symbiote-engine-core §3).
    let node: unknown = null;
    const lifecycle = createAnimatedLeafLifecycle('solid');

    // NOT the native-driver switch. A useNativeDriver animation promotes the graph itself
    // (animations/base.ts -> value.__startNativeAnimation -> graph.__makeNative) and the leaf
    // follows through __addChild, with or without this. This is only RN's EAGER promotion for the
    // sticky-header passthrough, and it still needs a real native module to mean anything.
    const wantsNative = (): boolean => {
      const passthrough = local[PASSTHROUGH_PROP];
      return (
        passthrough !== undefined &&
        passthrough !== null &&
        isNativeAnimatedAvailable()
      );
    };

    // withStableKeys: reduceProps' key set follows `rest`, which a caller can shrink between runs,
    // and Solid's `spread` has no removal pass — a vanished key would keep its last value on the
    // native view forever (.claude/rules/solid-descriptor-bridge.md §1). The host primitives widen
    // their own bags too, but relying on that would make this wrap correct only by accident.
    const bag = withStableKeys(() => {
      const reduced = reduceProps({ ...rest });
      const passthroughStyle = readPassthroughStyle(local[PASSTHROUGH_PROP]);
      if (passthroughStyle !== undefined) {
        reduced.style =
          reduced.style === undefined
            ? passthroughStyle
            : [reduced.style, passthroughStyle];
      }
      return reduced;
    });

    // Capture the base's public instance, resolve it to the underlying host node for the leaf
    // (unwrapping a scroll handle), and forward the ORIGINAL instance to the caller, who expects
    // the component's own handle. Ref shape rationale: utils/host-ref.ts.
    const captureRef = (instance: unknown): void => {
      node = resolveHostNode(instance);
      if (typeof local.ref === 'function') local.ref(instance);
    };

    // createEffect, not createRenderEffect: the node has to exist first. The ref above fills it
    // while the element is built, which is strictly before any effect runs.
    createEffect(() => {
      const current = { ...rest };
      const wants = wantsNative();
      const target = isSymbioteNode(node) ? node : null;
      lifecycle.reconcile(
        current,
        target,
        wants,
        target === null ? undefined : bind => whenCommitted(target, bind),
      );
    });

    onCleanup(() => {
      lifecycle.teardown();
    });

    // ONE merge, never a spread followed by an explicit prop: mergeProps takes the first
    // NON-undefined value scanning back-to-front, so a later explicit `undefined` would lose
    // (.claude/rules/solid-descriptor-bridge.md §6). Safe here because the second source carries
    // only `ref` and `children`, neither of which is the vanishing kind. The getter keeps children
    // lazy so reading the bag never walks the child subtree.
    const childProps = mergeProps(bag, {
      ref: captureRef,
      get children(): JSX.Element {
        return local.children;
      },
    });

    // Narrowed HERE and not around the whole factory: `Base` is a parameter captured by this inner
    // function, so a check outside it does not reach the JSX below.
    if (typeof Base === 'string') {
      const element = createElement(Base);
      spread(element, childProps, false);
      // createElement's return type is the renderer's node union, which includes the SURFACE — a
      // root the renderer is handed, never something a tag produces. Narrowed rather than cast, and
      // thrown rather than defaulted: returning null here would paint nothing and stay green.
      if (!isSymbioteNode(element))
        throw new Error(
          `createAnimatedComponent: <${Base}> did not build a host node`,
        );
      return element;
    }

    return <Base {...childProps} />;
  };
}
