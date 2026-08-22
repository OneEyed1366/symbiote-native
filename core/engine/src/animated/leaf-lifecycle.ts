// The AnimatedProps leaf lifecycle every Animated.* wrapper needs: build a leaf from the current
// props, swap it into the value graph, bind it to the committed node, go native when asked, and
// rebind native event props. Framework-agnostic on purpose - it knows nothing about hooks,
// effects, change detection or reactivity, only the engine's own Animated primitives.
//
// WHY THIS LIVES IN THE ENGINE. It used to live four times, once per adapter (React's
// create-animated-component.tsx, Vue's create-animated-component.ts, Svelte's
// animated-props-runtime.ts, Angular's animated-leaf-binder.ts). Each re-derived the same policy,
// and they drifted: only Svelte ever grew the rebuild guard below, after a day of device
// debugging in 2026-08. React's `useMemo(..., [rest])` LOOKS like the same guard but is not - its
// dependency is a fresh rest-destructured object every render - and Vue's `pendingLeaf === null`
// answers "has render run yet", not "did anything change". A fix landing in one copy is exactly
// what <adapters_reach_full_feature_parity> forbids: parity has to be structural.
//
// What stays in the adapter: WHEN to call reconcile (an effect, onUpdated, ngOnChanges, a $effect)
// and HOW to find the host node (a ref, a ViewChild, a shim). Everything below is the same for all.

import { AnimatedProps } from './props';
import { attachNativeEventHandler } from './event';
import { dlog } from '../debug';
import type { ISymbioteNode } from '../node';

// Diagnostic-only, DEBUG-gated: a process-wide sequence number so every reconcile call across
// every Animated.* instance in a log dump is individually identifiable and orderable.
let globalReconcileSeq = 0;

// Per-key identity comparison, NOT deep equality. A style/handler/props object that is memoized
// upstream stays `===` across ticks that did not touch it, which is what distinguishes "same
// content" from a real change. Deep-comparing instead would walk live AnimatedNode graphs, which
// are circular.
//
// The caller MUST pass a stored SNAPSHOT as `a` - see `lastProps` below. Handing this the same
// live object on both sides compares it with itself and is unconditionally true.
function shallowEqualProps(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

// Diagnostic-only. `style` here is a raw prop value, so it can be anything the caller wrote -
// an object, an array of them, a class name, undefined. Read the field, do not assume a shape.
function readTransform(style: unknown): unknown {
  if (typeof style !== 'object' || style === null) return undefined;
  return Reflect.get(style, 'transform');
}

// Diagnostic-only: a SHALLOW, non-serializing description of a style.transform array. Props here
// carry RAW values - an animated entry is a live AnimatedNode in a circular parent<->children
// graph - so JSON.stringify throws "Converting circular structure to JSON". Describe by
// constructor name instead of walking it.
function describeTransform(value: unknown): string {
  if (!Array.isArray(value)) return String(value);
  const entries = value.map(entry => {
    if (typeof entry !== 'object' || entry === null) return String(entry);
    const [key] = Object.keys(entry);
    const inner = key === undefined ? undefined : Reflect.get(entry, key);
    const innerDesc =
      typeof inner === 'number' || typeof inner === 'string'
        ? String(inner)
        : `<${inner !== null && typeof inner === 'object' ? inner.constructor.name : typeof inner}>`;
    return `${key}:${innerDesc}`;
  });
  return `[${entries.join(',')}]`;
}

// Runs the native half of a reconcile - `setNativeView` / `__makeNative` / event attach - at a
// moment the CALLER chooses, returning a canceller for a run that has not happened yet. Angular
// passes `bind => whenCommitted(node, bind)`, because under its batched zoneless change detection
// the host's Fabric tag does not exist yet at ngAfterViewInit time. Everyone else omits it and the
// native half runs inline.
//
// Only the NATIVE half is deferrable. Building the leaf and attaching it to the VALUE GRAPH always
// happens synchronously, and that split is load-bearing: a deferred build would sit behind a
// canceller that the next reconcile drops, so a component reconciling faster than it commits would
// never attach anything at all - the sticky-header pin would stay at its resting value forever.
export type IScheduleNativeBind = (bind: () => void) => (() => void) | void;

export type IAnimatedLeafLifecycle = {
  // Rebuild the leaf from `props`, swap it into the value graph (new before old), then bind it to
  // `node` (null while the host has no node at all), go native if `wantsNative`, and rebind any
  // native-attachable event props. Call on every update.
  reconcile(
    props: Record<string, unknown>,
    node: ISymbioteNode | null,
    wantsNative: boolean,
    scheduleNativeBind?: IScheduleNativeBind,
  ): void;
  // Detach the last-attached leaf and any native event bindings. Call once, on unmount.
  teardown(): void;
};

export function createAnimatedLeafLifecycle(
  label: string,
): IAnimatedLeafLifecycle {
  let attached: AnimatedProps | null = null;
  let eventDetachers: Array<() => void> = [];
  // Diagnostic-only: the last node identity, plus a reentrancy flag to catch reconcile() being
  // called AGAIN from inside its own call stack - the smoking-gun shape for a synchronous
  // same-flush loop, as opposed to merely "called often".
  let lastNode: ISymbioteNode | null = null;
  let inReconcile = false;
  // Last-seen props/wantsNative for the skip below - a real content check, not diagnostics.
  let lastProps: Record<string, unknown> | null = null;
  let lastWantsNative = false;
  // Canceller for a native bind the caller deferred and that has not run yet.
  let cancelPendingBind: (() => void) | undefined;

  function detachEvents(): void {
    for (const detach of eventDetachers) detach();
    eventDetachers = [];
  }

  return {
    reconcile(props, node, wantsNative, scheduleNativeBind): void {
      const seq = ++globalReconcileSeq;
      const reentrant = inReconcile;
      const nodeChanged = node !== lastNode;
      const wantsNativeChanged = wantsNative !== lastWantsNative;
      const propsChanged =
        lastProps === null || !shallowEqualProps(lastProps, props);
      lastNode = node;
      lastWantsNative = wantsNative;
      // A SNAPSHOT, never the reference. A caller can legitimately hand back the SAME object on
      // every update, mutating what its keys resolve to rather than allocating (Svelte's rest
      // proxy does exactly that, device-confirmed 2026-08-13); storing it would make the next
      // call run shallowEqualProps on that object against ITSELF - reading the same current values
      // through both sides - which is unconditionally true. `propsChanged` could then never be
      // true again and reconcile would be skipped forever, so every rebuilt AnimatedInterpolation
      // never reaches the native graph: the view stays wired to the FIRST interpolation, built
      // before measurement with range [-1,0]->[0,0]. One pixel of travel, which on device reads as
      // "the sticky header ignores scrolling entirely".
      lastProps = { ...props };
      // Thunk, not a string: reconcile runs on EVERY update of every Animated.* wrapper in the
      // app (Angular re-reads it on each change-detection pass), and describeTransform allocates.
      // Built eagerly it would cost its full price with logging off.
      dlog(
        () =>
          `AnimatedProps[${label}] reconcile#${seq} reentrant=${reentrant} wantsNative=${wantsNative} ` +
          `hasNode=${node !== null} nodeChanged=${nodeChanged} propsChanged=${propsChanged} ` +
          `transform=${describeTransform(readTransform(props.style))}`,
      );
      if (reentrant) {
        dlog(
          `AnimatedProps[${label}] reconcile#${seq} *** RE-ENTRANT CALL DETECTED - see reconcile above ***`,
        );
      }
      // Nothing meaningfully changed since the last call AND we are already natively connected
      // (steady state) - skip tearing down and rebuilding the native AnimatedProps graph.
      //
      // Deliberately scoped to `attached.__isNative()` ONLY: before the first native connection,
      // reconcile must run unconditionally on every tick - that cadence is what wires a rebuilt
      // interpolation node into the shared value's children (AnimatedInterpolation.__attach ->
      // parent.__addChild, cascaded from AnimatedProps.__attach); skipping there can leave a
      // freshly rebuilt interpolation never attached, so its listener never fires. Once native and
      // staying native, that bootstrap concern is moot - and rebuilding there was the
      // collision-disappearance bug: every scroll-driven passthrough tick reconnected a brand new
      // native node (restoreDefaultValues + connect) even though nothing animated-relevant had
      // changed, and a reconnect landing exactly when scrolling stopped left the view frozen at
      // its post-reset default until the next tick.
      if (
        attached !== null &&
        attached.__isNative() &&
        !nodeChanged &&
        !wantsNativeChanged &&
        !propsChanged
      ) {
        dlog(
          `AnimatedProps[${label}] reconcile#${seq} skipped (no-op: already native, props/node unchanged)`,
        );
        return;
      }
      inReconcile = true;
      try {
        // Attach the NEW leaf BEFORE detaching the OLD one: a shared Value self-detaches (dropping
        // its native node) the instant its child count hits zero, so detaching first would kill a
        // running native animation on any unrelated update. Mirrors RN's
        // AnimatedComponent._attachProps.
        const newLeaf = new AnimatedProps(props);
        newLeaf.__attach();
        if (attached !== null && attached !== newLeaf) attached.__detach();
        attached = newLeaf;

        // The native half, which a caller may defer. Rebinds events each reconcile so a new inline
        // event re-attaches, detaching first so the prior binding does not leak;
        // attachNativeEventHandler no-ops unless the prop really is a native event handler on a
        // committed node, so the JS path stays the fallback.
        const bindNative = (): void => {
          if (node !== null) newLeaf.setNativeView(node);
          if (wantsNative) newLeaf.__makeNative();
          detachEvents();
          if (node === null) return;
          for (const key of Object.keys(props)) {
            const attachment = attachNativeEventHandler(node, key, props[key]);
            if (attachment !== undefined)
              eventDetachers.push(attachment.detach);
          }
        };

        cancelPendingBind?.();
        cancelPendingBind = undefined;
        if (scheduleNativeBind === undefined || node === null) {
          bindNative();
          return;
        }
        cancelPendingBind = scheduleNativeBind(bindNative) ?? undefined;
      } finally {
        inReconcile = false;
      }
    },
    teardown(): void {
      cancelPendingBind?.();
      cancelPendingBind = undefined;
      detachEvents();
      if (attached !== null) {
        attached.__detach();
        attached = null;
      }
    },
  };
}
