// The shared reconcile/teardown machinery behind every Animated.* component
// (AnimatedView / AnimatedText / AnimatedImage / AnimatedScrollView) — the Svelte twin of
// Vue's reconcile()/detachEvents() inside create-animated-component.ts, factored out so
// each component's own `$effect` calls it instead of re-deriving the same ordering four
// times. Svelte has no generic h()/createElement to wrap an arbitrary base component the
// way Vue/React do (see this module's index.ts header comment), so each Animated.*
// component is its own small `.svelte` file; this is the one piece that genuinely is
// framework-lifecycle-agnostic between them.
//
// Preserves the "attach new before detach old" invariant Vue's file documents: a shared
// Value self-detaches (and drops its native node) the instant its child count hits zero,
// so detaching the previous leaf before the new one is attached would kill a running
// native-driven animation on any unrelated reactive update.
//
// The framework-agnostic pieces (AnimatedProps, attachNativeEventHandler) live in
// @symbiote-native/engine and are used as-is.

import {
  AnimatedProps,
  attachNativeEventHandler,
  dlog,
  type ISymbioteNode,
} from '@symbiote-native/engine';

// Diagnostic-only, DEBUG-gated (see dlog): a process-wide sequence number so every reconcile
// call across every Animated.* instance in a log dump is individually identifiable and orderable.
let globalReconcileSeq = 0;

// `rest !== lastRest` is never a useful signal: Svelte hands back the SAME rest-props proxy on
// every reactive tick, mutating what its keys resolve to rather than allocating a new object.
// Compare per-key by identity instead — a style/handler/etc. object that is independently
// memoized upstream stays `===` across ticks that didn't touch it, so this distinguishes "same
// content" from a real change. NOTE the caller must pass a stored SNAPSHOT as `a` (see `lastRest`
// below): handing this function the live proxy on both sides compares it with itself and always
// returns true.
function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

// Diagnostic-only: a SHALLOW, non-serializing description of a style.transform array. `rest` here
// carries the RAW props — an animated entry's value is a live AnimatedNode (AnimatedInterpolation/
// AnimatedStyle/...), part of a circular parent<->children graph — so JSON.stringify throws
// "Converting circular structure to JSON". Describe by constructor name instead of walking it.
function describeTransform(value: unknown): string {
  if (!Array.isArray(value)) return String(value);
  const entries = value.map(entry => {
    if (typeof entry !== 'object' || entry === null) return String(entry);
    const [key] = Object.keys(entry);
    const inner = key === undefined ? undefined : (entry as Record<string, unknown>)[key];
    const innerDesc =
      typeof inner === 'number' || typeof inner === 'string'
        ? String(inner)
        : `<${inner !== null && typeof inner === 'object' ? inner.constructor.name : typeof inner}>`;
    return `${key}:${innerDesc}`;
  });
  return `[${entries.join(',')}]`;
}

export interface IAnimatedReconcileRuntime {
  // Rebuild the leaf from `rest`, swap it into the value graph (new before old), bind it to
  // `node` (null while the host isn't committed yet — reconcile is safe to call again once
  // it is), go native if `wantsNative`, and rebind any native-attachable event props found
  // in `rest`. Call on every reactive update (mirrors Vue's onMounted + onUpdated).
  reconcile(rest: Record<string, unknown>, node: ISymbioteNode | null, wantsNative: boolean): void;
  // Detach the last-attached leaf and any native event bindings. Call once, on unmount.
  teardown(): void;
}

export function createAnimatedReconcileRuntime(): IAnimatedReconcileRuntime {
  let attached: AnimatedProps | null = null;
  let eventDetachers: Array<() => void> = [];
  // Diagnostic-only: last node/style.transform identities, to log whether a call is driven by a
  // genuinely new node/value or is a same-input re-entrant call — and a reentrancy flag to catch
  // reconcile() being called AGAIN from inside its own call stack (the smoking-gun shape for a
  // synchronous same-flush loop, vs. merely "called often").
  let lastNode: ISymbioteNode | null = null;
  let inReconcile = false;
  // Last-seen rest/wantsNative, for the no-op skip below (a real content-equality check, not the
  // diagnostic-only fields above).
  let lastRest: Record<string, unknown> | null = null;
  let lastWantsNative = false;

  function detachEvents(): void {
    for (const detach of eventDetachers) detach();
    eventDetachers = [];
  }

  return {
    reconcile(rest, node, wantsNative): void {
      const seq = ++globalReconcileSeq;
      const reentrant = inReconcile;
      const nodeChanged = node !== lastNode;
      const wantsNativeChanged = wantsNative !== lastWantsNative;
      const restChanged = lastRest === null || !shallowEqual(lastRest, rest);
      lastNode = node;
      lastWantsNative = wantsNative;
      // A SNAPSHOT, never the reference. Svelte's rest-props object is a PROXY with a stable
      // identity across updates (device-confirmed 2026-08-13), so storing `rest` itself makes the
      // next call run shallowEqual on that proxy against ITSELF — reading the same current values
      // through both sides — which is unconditionally true. `restChanged` could then never be true
      // again and reconcile skipped forever, so every rebuilt AnimatedInterpolation (a fresh node
      // on each 'rebuild-interpolation') never reached the native graph: the view stayed wired to
      // the FIRST interpolation, built before measurement with range [-1,0,0,1]->[0,0,0,1] — one
      // pixel of travel, which on device reads as "the sticky header ignores scrolling entirely".
      lastRest = { ...rest };
      const styleValue = (rest.style as Record<string, unknown> | undefined)?.transform;
      dlog(
        `AnimatedProps reconcile#${seq} reentrant=${reentrant} wantsNative=${wantsNative} ` +
          `hasNode=${node !== null} nodeChanged=${nodeChanged} restChanged=${restChanged} ` +
          `transform=${describeTransform(styleValue)}`,
      );
      if (reentrant) {
        dlog(
          `AnimatedProps reconcile#${seq} *** RE-ENTRANT CALL DETECTED — see reconcile above ***`,
        );
      }
      // Nothing meaningfully changed since the last call AND we are already natively connected
      // (steady state) — skip tearing down and rebuilding the native AnimatedProps graph.
      // Deliberately scoped to `attached.__isNative()` ONLY: before the first native connection,
      // reconcile must run unconditionally on every tick — that cadence is what wires a rebuilt
      // interpolation node into the shared scroll Value's children (AnimatedInterpolation.__attach
      // -> parent.__addChild, cascaded from AnimatedProps.__attach); skipping there can leave a
      // freshly rebuilt interpolation never attached, so its listener never fires. Once native and
      // staying native, that bootstrap concern is moot — rebuilding here was the
      // collision-disappearance bug: every scroll-driven passthrough tick reconnected a brand new
      // native node (restoreDefaultValues + connect) even though nothing animated-relevant changed,
      // and a reconnect landing exactly when scrolling stopped left the view frozen at its
      // post-reset default until the next tick.
      if (
        attached !== null &&
        attached.__isNative() &&
        !nodeChanged &&
        !wantsNativeChanged &&
        !restChanged
      ) {
        dlog(`AnimatedProps reconcile#${seq} skipped (no-op: already native, rest/node unchanged)`);
        return;
      }
      inReconcile = true;
      try {
        const newLeaf = new AnimatedProps(rest);
        newLeaf.__attach();
        if (attached !== null && attached !== newLeaf) attached.__detach();
        attached = newLeaf;
        if (node !== null) newLeaf.setNativeView(node);
        if (wantsNative) newLeaf.__makeNative();

        detachEvents();
        if (node !== null) {
          for (const key of Object.keys(rest)) {
            const attachment = attachNativeEventHandler(node, key, rest[key]);
            if (attachment !== undefined) eventDetachers.push(attachment.detach);
          }
        }
      } finally {
        inReconcile = false;
      }
    },
    teardown(): void {
      detachEvents();
      if (attached !== null) {
        attached.__detach();
        attached = null;
      }
    },
  };
}
