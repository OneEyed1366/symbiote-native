// createAnimatedComponent: the Vue twin of the React wrapper. Wraps a base component
// (View/Text/Image/ScrollView/any) so it accepts AnimatedNodes in its props. Framework-agnostic
// pieces (reduceProps/readPassthroughStyle/resolveHostNode/isAnimatedNode + the AnimatedProps
// leaf) live in @symbiote-native/engine, shared verbatim with React; Vue supplies only the
// lifecycle: a render that rebuilds the leaf each pass + a post-commit reconcile (onMounted/
// onUpdated) + a function ref. The per-frame path is unchanged and NEVER goes through Vue
// render: value.setValue / animation -> flushValue -> AnimatedProps.update() -> setNativeProps(node).

import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  shallowRef,
  type Component,
  type SetupContext,
} from '@vue/runtime-core';
import {
  createAnimatedLeafLifecycle,
  isNativeAnimatedAvailable,
  isSymbioteNode,
  reduceProps,
  readPassthroughStyle,
  resolveHostNode,
} from '@symbiote-native/engine';
import { normalizeVueAttrs } from '../../utils/normalize-attrs';

// RN's prop carrying explicit (already-rasterized) values that override the animated prop in
// the COMMITTED props (sticky-header passthrough). Named once here so render/reconcile agree.
const PASSTHROUGH_PROP = 'passthroughAnimatedPropExplicitValues';

// Reads either a functional component's or a stateful defineComponent's display name, without a
// cast, for the wrapper's devtools name. A string base IS its own name — an intrinsic tag carries
// no displayName to read.
function baseName(component: Component | string): string {
  if (typeof component === 'string') return component;
  if (
    component === null ||
    (typeof component !== 'function' && typeof component !== 'object')
  ) {
    return 'Anonymous';
  }
  const display = Reflect.get(component, 'displayName');
  if (typeof display === 'string') return display;
  const name = Reflect.get(component, 'name');
  if (typeof name === 'string') return name;
  return 'Anonymous';
}

// The base may be an intrinsic TAG, not only a component: `Animated.View` is built over `View`,
// and a primitive that becomes a public tag hands this a string. `h()` takes either.
export function createAnimatedComponent(Component: Component | string) {
  return defineComponent({
    name: `Animated(${baseName(Component)})`,
    inheritAttrs: false,
    setup(_props, { attrs: rawAttrs, slots, expose }: SetupContext) {
      // shallowRef, not ref: a deep ref() would run it through toReactive() and hand back a
      // Proxy, missing the engine's WeakMap mirror. Same rule as Switch / ScrollView host nodes.
      const nodeRef = shallowRef<unknown>(null);
      // The base component's public instance (a ScrollView handle, or the host node for View),
      // forwarded to a parent ref via expose(). shallowRef: it may itself BE an engine node.
      const instanceRef = shallowRef<unknown>(null);

      // The leaf lifecycle - build/swap/bind/detach, and the rebuild-vs-skip decision - is the
      // engine's, shared by every adapter (core/engine/src/animated/leaf-lifecycle.ts). Vue owns
      // only WHEN to run it: after mount and after every re-render, which is when `currentRest`
      // has just been refreshed by the render function below.
      const lifecycle = createAnimatedLeafLifecycle('vue');
      // The props the next reconcile should wire in, refreshed by render each pass.
      let currentRest: Record<string, unknown> = {};
      let wantsNative = false;

      function reconcile(): void {
        lifecycle.reconcile(
          currentRest,
          isSymbioteNode(nodeRef.value) ? nodeRef.value : null,
          wantsNative,
        );
      }

      onMounted(reconcile);
      onUpdated(reconcile);
      onBeforeUnmount(() => lifecycle.teardown());

      // On mount the base hands back its public instance; resolve it to the underlying host node
      // (unwrapping a scroll-container handle via getScrollNode) for the leaf binding / event
      // attach, and keep the ORIGINAL instance for ref forwarding.
      const captureRef = (instance: unknown): void => {
        instanceRef.value = instance;
        nodeRef.value = resolveHostNode(instance);
      };

      // A delegating proxy because the instance is captured async (after mount), so a snapshot
      // exposed at setup time would be null.
      expose(
        new Proxy(Object.create(null), {
          get: (_target, key): unknown => {
            const instance = instanceRef.value;
            if (instance === null || typeof instance !== 'object')
              return undefined;
            return Reflect.get(instance, key);
          },
          has: (_target, key): boolean => {
            const instance = instanceRef.value;
            return (
              instance !== null &&
              typeof instance === 'object' &&
              Reflect.has(instance, key)
            );
          },
        }),
      );

      return () => {
        const attrs = normalizeVueAttrs(rawAttrs);
        // Split into the passthrough (consumed) and the rest (forwarded). The passthrough never
        // reaches the base as a prop; it only overrides the committed style below.
        const rest: Record<string, unknown> = {};
        let passthrough: unknown;
        for (const key of Object.keys(attrs)) {
          if (key === PASSTHROUGH_PROP) {
            passthrough = attrs[key];
            continue;
          }
          rest[key] = attrs[key];
        }
        currentRest = rest;
        // Native driving is opt-in per the passthrough prop AND requires a real native module;
        // headless/unsupported hosts keep the JS flush path.
        wantsNative = passthrough != null && isNativeAnimatedAvailable();

        // Reduced props are concrete (animated nodes replaced by their current values) so the
        // first paint carries real values.
        const reduced = reduceProps(rest);
        // Override the committed style with the explicit passthrough values (last wins via the
        // style array) so the ShadowTree carries the current transform.
        const passthroughStyle = readPassthroughStyle(passthrough);
        if (passthroughStyle !== undefined) {
          reduced.style =
            reduced.style === undefined
              ? passthroughStyle
              : [reduced.style, passthroughStyle];
        }
        reduced.ref = captureRef;
        // The WHOLE slots object, for a component base AND for a tag base. Not just `default`:
        // the list containers take their content through named scoped slots (`item`,
        // `sectionHeader`, ...), which a default-only forward drops silently — Animated.FlatList
        // would commit empty cells.
        //
        // A string base needs no branch here, and the reason is worth recording because the code
        // that reads it looks like it does. For an element Vue unwraps the object itself, calling
        // `children.default()` and recursing on the RESULT rather than going back through `h`
        // (`normalizeChildren`, the `shapeFlag & (1 | 64)` branch) — so a slot returning a lone
        // VNode would be re-read as an object, found to have no `.default`, and dropped, with no
        // error. That case cannot arise: Vue wraps every slot at initSlots so `slots.default()`
        // returns an ARRAY whatever the author's function returned. Measured both spellings.
        return h(Component, reduced, slots);
      };
    },
  });
}
