// Unit tests for AnimatedLeafBinder in isolation — no Angular involved. Both
// AnimatedComponentBase and AnimatedImage delegate their leaf-lifecycle (build a leaf,
// bind it to the committed Fabric node, swap leaves on re-render, tear down) to this Pure
// Fabrication; these tests exercise the binder directly against a real engine node
// (SymbioteSurface + the fake Fabric backend), so a break here isolates to the shared
// orchestration rather than either owning component.
//
// Coverage dictionary (./animated-leaf-binder.ts):
//   constructor — covered indirectly (every test constructs a binder via the resolver+label
//     shape; there is no branch inside it worth isolating).
//   reconcile — attach-new-before-detach-old order: covered ("attaches the new leaf...").
//     `this.attached === null` (first call, nothing to detach): covered implicitly by every
//     test's first reconcile(), not asserted on its own since there is nothing to observe besides
//     "did not throw". The `this.attached === newLeaf` branch (reuse the SAME leaf instance) is
//     N/A — `newLeaf` is `new AnimatedProps(props)`, a fresh object every call, so that identity
//     can never be true through the real reconcile() call path; only reachable with a hand-built
//     fake leaf, which is out of the unit's contract.
//   bindNode (private, exercised through reconcile) — cancels a still-pending previous bind:
//     covered ("attaches the new leaf... on a second reconcile" implicitly re-binds; the pending-
//     bind-CANCELLED-by-a-second-reconcile-before-first-commit case specifically is NOT isolated
//     as its own assertion — the observable effect (old leaf's bind never firing) is subsumed by
//     "detaches the leaf and cancels any pending bind on destroy", the sharper version of the same
//     cancel-then-never-fire contract). `resolveNode() -> null` (the @ViewChild-not-ready race
//     AnimatedComponentBase/AnimatedImage hit before their inner view mounts): covered by "silent
//     no-op when the resolver has no node yet" below — previously untested.
//   attachEvents / detachEvents (private) — the non-event prop path (attachNativeEventHandler
//     returns undefined for a plain `{ style: { opacity } }` bag with no __getEvent accessor) is
//     implicitly exercised by every test below. The REAL native-attach branch (a genuine
//     `Animated.event(..., { useNativeDriver: true })` handler whose event __isNative()) is N/A
//     here: __isNative() is gated on isNativeAnimatedAvailable(), which reads the real
//     NativeAnimatedModule/Turbo native module (core/engine/src/animated/native/
//     native-animated.ts) — @symbiote-native/test-utils installs a fake Fabric slot but no fake
//     native-animated module, so that gate is always false headless and the branch is
//     structurally unreachable from this suite; it needs a real device or a native-module fake
//     that doesn't exist yet, out of this unit's reachable contract.
//   destroy — cancels a pending bind + detaches the current leaf: covered ("detaches the leaf and
//     cancels any pending bind on destroy"). Safe when reconcile() was never called (the class's
//     own doc comment claims this): covered by "destroy() before any reconcile is a no-op" below
//     — previously untested, and the exact claim a bare `if (this.attached !== null)` guard makes.
//   No Negative group: nothing in this class throws (reconcile/bindNode/attachEvents/destroy are
//     all total over their inputs — a null resolver result or an empty prop bag both degrade to a
//     no-op, never a throw). Positive is the only group.
import { beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  AnimatedValue,
  createElement,
  createSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { AnimatedLeafBinder } from './animated-leaf-binder';

const fabric = installFabric();
let nextRootTag = 9001;

beforeEach(() => fabric.reset());

// A node that has already gone through a commit — whenCommitted fires synchronously.
function committedNode(): ISymbioteNode {
  const surface = createSurface(nextRootTag++);
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

// A node that is attached to a surface but has NOT been committed yet — whenCommitted
// must defer until the caller commits the surface.
function uncommittedNode(): { node: ISymbioteNode; commit: () => void } {
  const surface = createSurface(nextRootTag++);
  const node = createElement('RCTView');
  surface.appendChild(node);
  return { node, commit: () => surface.commit() };
}

// `appRoot()` unwraps RN's synthetic box-none AppContainer, which is ALSO an RCTView, so a
// plain `fabric.find(viewName === 'RCTView')` would match it instead of the node under test.
// Each test appends exactly one child, so the container's first (only) child is the real node.
function fakeView(): ReturnType<typeof fabric.find> {
  return fabric.appRoot().children[0];
}

describe('AnimatedLeafBinder', () => {
  describe('Positive', () => {
    // why: this is the entire point of the leaf — an AnimatedValue mutation must reach the
    // committed Fabric node's own prop, or every Animated.* component (View/Text/Image/
    // ScrollView) driven through this binder would render a static, non-animating value.
    it('creates and attaches an AnimatedProps leaf, wiring value changes onto the host node', () => {
      const node = committedNode();
      const binder = new AnimatedLeafBinder(() => node, 'test');
      const opacity = new AnimatedValue(1);

      // The leaf itself never pushes the INITIAL value — that first paint comes from the
      // owning component's own reduceProps template binding (out of scope here). The leaf
      // only drives value CHANGES after it is bound.
      binder.reconcile({ style: { opacity } }, false);

      opacity.setValue(0.4);
      expect(fakeView()?.props.opacity).toBe(0.4);
    });

    // why: this is the async-commit-timing gotcha angular-adapter-change-detection §1
    // documents (inherited from Vue) — Angular's own ngAfterViewInit fires before the host's
    // Fabric tag exists, so binding eagerly would silently no-op forever; whenCommitted's
    // post-commit retry is what makes an Animated prop on a not-yet-committed component work
    // at all instead of only working by accident of timing.
    it('binds to the host node via whenCommitted, deferring until the node is actually committed', () => {
      const { node, commit } = uncommittedNode();
      const binder = new AnimatedLeafBinder(() => node, 'test');
      const opacity = new AnimatedValue(1);

      binder.reconcile({ style: { opacity } }, false);
      // Not committed yet: the value graph exists, but no Fabric node to flush onto.
      opacity.setValue(0.5);
      expect(fabric.created).toHaveLength(0);

      commit();
      // whenCommitted's post-commit retry binds the leaf now; a subsequent change flushes.
      opacity.setValue(0.7);
      expect(fakeView()?.props.opacity).toBe(0.7);
    });

    // why: reconcile's own comment states WHY the order matters — a shared Value self-detaches
    // (drops its native node) the instant its child count hits zero, so detaching the old leaf
    // BEFORE attaching the new one would, for one tick, zero out a Value's child count and kill
    // a running native animation on any UNRELATED re-render that happens to reuse the same
    // shared Value. This proves the binder actually honors that ordering, not just that it
    // eventually settles on the right child count.
    it('attaches the new leaf before detaching the old one on a second reconcile', () => {
      const node = committedNode();
      const binder = new AnimatedLeafBinder(() => node, 'test');
      const shared = new AnimatedValue(1);
      const order: string[] = [];
      const originalAddChild = shared.__addChild.bind(shared);
      const originalRemoveChild = shared.__removeChild.bind(shared);
      shared.__addChild = child => {
        order.push('add');
        originalAddChild(child);
      };
      shared.__removeChild = child => {
        order.push('remove');
        originalRemoveChild(child);
      };

      binder.reconcile({ style: { opacity: shared } }, false);
      order.length = 0; // only care about the SECOND reconcile's swap order

      binder.reconcile({ style: { opacity: shared } }, false);

      expect(order).toEqual(['add', 'remove']);
    });

    // why: AnimatedComponentBase/AnimatedImage resolve their host via a `@ViewChild` that is
    // `undefined` for at least the first change-detection pass (Angular resolves view children
    // after the component's own constructor, before the first ngAfterViewInit) — reconcile()
    // can legitimately run before the resolver has anything to return. This must degrade to a
    // silent no-op, never throw, or the very FIRST reconcile of every Animated* component would
    // crash before its view ever mounts.
    it('reconcile is a silent no-op when the resolver has no node yet', () => {
      const binder = new AnimatedLeafBinder(() => null, 'test');
      const opacity = new AnimatedValue(1);

      expect(() => binder.reconcile({ style: { opacity } }, false)).not.toThrow();
      opacity.setValue(0.4);
      // Nothing to bind to yet: no Fabric node was ever created, let alone flushed onto.
      expect(fabric.created).toHaveLength(0);
    });

    // why: destroy()'s own doc comment claims this ("Safe to call even if reconcile() was never
    // called") — Angular calls ngOnDestroy on every component teardown regardless of whether its
    // view ever fully initialized (e.g. a component destroyed mid-mount by a fast route change),
    // so destroy() must tolerate being the FIRST call on a binder, not just the last.
    it('destroy() before any reconcile is a safe no-op', () => {
      const binder = new AnimatedLeafBinder(() => committedNode(), 'test');
      expect(() => binder.destroy()).not.toThrow();
    });

    // why: detaches the leaf and cancels any pending bind on destroy — the leak the whole
    // cancel-bind mechanism exists to prevent: if a component is torn down (e.g. a fast route
    // change) BEFORE its host node ever committed, a later commit must not retroactively bind an
    // already-detached leaf to a component instance that no longer exists.
    it('detaches the leaf and cancels any pending bind on destroy', () => {
      const { node, commit } = uncommittedNode();
      const binder = new AnimatedLeafBinder(() => node, 'test');
      const opacity = new AnimatedValue(1);

      binder.reconcile({ style: { opacity } }, false);
      binder.destroy();
      commit();

      // The pending whenCommitted bind was cancelled by destroy, so committing afterward
      // must not retroactively bind the (already-detached) leaf.
      opacity.setValue(0.9);
      expect(fakeView()?.props.opacity).toBeUndefined();
    });
  });
});
