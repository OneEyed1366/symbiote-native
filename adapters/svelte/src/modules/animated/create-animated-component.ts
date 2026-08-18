// createAnimatedComponent: the Svelte twin of the React/Vue/Solid wrapper. Wraps ANY base
// component so it accepts AnimatedNodes in its props. The framework-agnostic half
// (reduceProps / readPassthroughStyle / resolveHostNode / the AnimatedProps leaf lifecycle)
// comes from @symbiote-native/engine, shared verbatim with every other adapter; only the
// lifecycle below is Svelte's.
//
// WHY IT IS PLAIN TS AND NOT A PARAMETRIZED `.svelte` FILE. The generic wrap expresses fine in
// Svelte — `<Component {...reduced} bind:this={inner} />` over a `component` prop compiles clean
// — but a `.ts` module that imports a `.svelte` file is unparseable by any tool without the
// Svelte plugin, which includes this repo's vitest and every consumer smoke test that builds an
// Animated namespace by hand (packages/navigation's drawer suite). Writing the component body
// against `svelte/internal/client` keeps `createAnimatedComponent` importable from ordinary TS
// everywhere, and leaves `modules/animated/` with no `.svelte` file at all. The internals used
// here are the exact calls the compiler itself emits for the same source — see this package's
// `svelte-internal-client.d.ts`, and §8 of the svelte-adapter-dom-shim skill for the bump
// checklist that covers them.
//
// TWO WAYS TO THE HOST NODE, because Svelte has no ref fall-through. `bind:this` on a COMPONENT
// resolves to that component's exports, never to its element:
//   * a scroll container (ScrollView / FlatList / SectionList) exports an imperative handle, so
//     resolveHostNode() unwraps it through getScrollNode() — the same call React and Vue make.
//     Binding the leaf to the handle itself type-checks and then silently animates nothing.
//   * a plain host primitive (View / Text / Image) exports nothing, so the node arrives through
//     an `{@attach}` of our own: every Symbiote component forwards attachments onto its host tag
//     (runes/attachments.ts), which is the adapter's documented seam to a committed node.
// A base this adapter does not own works if it does either.
//
// EVERY OTHER PROP IS FORWARDED UNTOUCHED, including snippets. Svelte snippets — `children` and
// named scoped ones such as a list's `item` / `sectionHeader` — are ordinary props, so naming any
// of them here would drop the rest: Vue's wrapper forwarded only its default slot and
// Animated.FlatList committed empty cells with no error. The only prop this wrapper consumes is
// `passthroughAnimatedPropExplicitValues`.

import { createAttachmentKey } from 'svelte/attachments';
import {
  derived,
  get,
  pop,
  push,
  set,
  spread_props,
  state,
  user_effect,
} from 'svelte/internal/client';
import type { Component, ComponentInternals } from 'svelte';
import {
  createAnimatedLeafLifecycle,
  isNativeAnimatedAvailable,
  isSymbioteNode,
  readPassthroughStyle,
  reduceProps,
  resolveHostNode,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { ShimElement } from '../../dom-shim';
import type { IAnimatedComponentProps } from './animated-component-props';

// RN's prop carrying explicit (already-rasterized) values that override the animated prop in the
// COMMITTED props (sticky-header passthrough). Named once so reduce and reconcile agree.
const PASSTHROUGH_PROP = 'passthroughAnimatedPropExplicitValues';

// The three keys Svelte's own compiled `rest_props` always drops, plus the prop we consume.
const BASE_EXCLUDES = new Set([
  '$$slots',
  '$$events',
  '$$legacy',
  PASSTHROUGH_PROP,
]);

// The leaf additionally never sees `children`: an AnimatedProps leaf rasterizes its props into
// setNativeProps on every frame, and a snippet is not a Fabric prop. It still reaches the BASE.
const LEAF_EXCLUDES = new Set([...BASE_EXCLUDES, 'children']);

// A component's exports are only known at runtime, so the base is typed by the shape every
// compiled Svelte component has. `props: never` is what lets ANY base's own prop type satisfy
// this parameter (parameters are contravariant) without an `as` cast.
type IAnimatedBase<TExports extends Record<string, unknown>> = (
  internals: ComponentInternals,
  props: never,
) => TExports;

// A fresh plain object each call, never the live props proxy: the leaf lifecycle stores its
// argument as the previous-props SNAPSHOT and compares the next call against it, so handing it
// one live object twice compares that object with itself and skips every reconcile forever.
function collect(
  props: object,
  excludes: ReadonlySet<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (excludes.has(key)) continue;
    out[key] = Reflect.get(props, key);
  }
  return out;
}

// Reads the base's display name for the dlog label, without a cast, so a reconcile line in a log
// dump says which Animated.* it came from — the per-component labels the six hand-authored files
// used to hardcode.
function baseName(base: unknown): string {
  if (typeof base !== 'function' && typeof base !== 'object')
    return 'Anonymous';
  if (base === null) return 'Anonymous';
  const name = Reflect.get(base, 'name');
  return typeof name === 'string' && name.length > 0 ? name : 'Anonymous';
}

function hostNode(
  instance: unknown,
  shim: ShimElement | null,
): ISymbioteNode | null {
  const unwrapped = resolveHostNode(instance);
  if (isSymbioteNode(unwrapped)) return unwrapped;
  return shim?.engineNode ?? null;
}

export function createAnimatedComponent<
  TExports extends Record<string, unknown>,
>(Base: IAnimatedBase<TExports>): Component<IAnimatedComponentProps, TExports> {
  const label = `Animated(${baseName(Base)})`;

  return function AnimatedComponent(
    internals: ComponentInternals,
    props: IAnimatedComponentProps,
  ): TExports {
    // The compiled twin of a component's own `$props()` scope: without it the `$effect`s below
    // are created immediately instead of being deferred to mount, and would first run before
    // the base has rendered anything.
    push(props, true);

    const lifecycle = createAnimatedLeafLifecycle(label);
    // The `$state.raw` twin: the shim is held by IDENTITY (a deep proxy would miss the engine's
    // WeakMap mirror) and read inside the reconcile effect, so the leaf rebinds when it lands.
    const hostShim = state<ShimElement | null>(null);

    // Rasterized props for the declarative bag: every animated node replaced by its current
    // value, so the first paint already carries concrete values. The per-FRAME path is separate
    // (AnimatedProps.update -> setNativeProps) and never goes through this.
    const reduced = derived(() => {
      const out = reduceProps(collect(props, BASE_EXCLUDES));
      const passthroughStyle = readPassthroughStyle(
        Reflect.get(props, PASSTHROUGH_PROP),
      );
      if (passthroughStyle !== undefined) {
        out.style =
          out.style === undefined
            ? passthroughStyle
            : [out.style, passthroughStyle];
      }
      return out;
    });

    // `reduceProps` rebuilds a plain string-keyed Record, so `{@attach}`'s SYMBOL keys do not
    // survive it. This one is ours and rides as a second spread source; a user's own attachments
    // are re-collected the same way.
    const attachments: Record<symbol, unknown> = {
      [createAttachmentKey()]: (node: unknown): (() => void) => {
        set(hostShim, node instanceof ShimElement ? node : null);
        return () => set(hostShim, null);
      },
    };
    for (const key of Object.getOwnPropertySymbols(props)) {
      attachments[key] = Reflect.get(props, key);
    }

    const instance = Base(
      internals,
      spread_props(() => get(reduced), attachments),
    );

    // `props` and the node are read unconditionally before any branch — a guarded read would
    // drop that dependency from later re-runs. reconcile() itself tolerates a null node.
    user_effect(() => {
      const leafProps = collect(props, LEAF_EXCLUDES);
      const node = hostNode(instance, get(hostShim));
      const passthrough = Reflect.get(props, PASSTHROUGH_PROP);
      lifecycle.reconcile(
        leafProps,
        node,
        passthrough != null && isNativeAnimatedAvailable(),
      );
    });

    user_effect(() => () => lifecycle.teardown());

    // The base's own exports ARE the wrapper's: a parent's `bind:this` on Animated.FlatList gets
    // the real scrollToOffset/scrollToIndex/getScrollNode surface, and a method added to the base
    // later cannot go missing here the way a hand-listed delegation would.
    return pop(instance);
  };
}
