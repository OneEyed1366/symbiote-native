// Angular's binding of the shared AnimatedProps leaf lifecycle (core/engine's
// createAnimatedLeafLifecycle). The POLICY - when to rebuild, when to skip, attach-new-before-
// detach-old, native event rebinding - lives in the engine and is identical for every adapter;
// this class supplies only the two things that are genuinely Angular's: how the host node is
// resolved (a @ViewChild directive, not a ref), and the whenCommitted deferral its batched
// change detection forces.
//
// Pure Fabrication (GRASP): kept as its own class rather than folded into AnimatedComponentBase so
// AnimatedImage - which must extend ImageBase instead - gets the same wiring by composition rather
// than copy-paste.
import {
  createAnimatedLeafLifecycle,
  whenCommitted,
  type IAnimatedLeafLifecycle,
  type ISymbioteNode,
} from '@symbiote-native/engine';

export class AnimatedLeafBinder {
  private readonly lifecycle: IAnimatedLeafLifecycle;

  // `resolveNode` stays a caller-supplied resolver (not a constructor-captured node) so this
  // class never needs to know HOW the host node is found - AnimatedComponentBase and
  // AnimatedImage both resolve it the same way (resolveHostNode + isSymbioteNode over their
  // own @ViewChild), but that's Angular DI state this binder has no business touching.
  // `label` is purely diagnostic (dlog), mirroring the constructor.name the pre-extraction
  // dlog call used.
  constructor(
    private readonly resolveNode: () => ISymbioteNode | null,
    label: string,
  ) {
    this.lifecycle = createAnimatedLeafLifecycle(label);
  }

  // Only the NATIVE half is deferred through whenCommitted (which runs it NOW when the node is
  // already committed - the steady state, and the only path a scroll frame takes). The leaf itself
  // always joins the value graph synchronously: deferring THAT too put the build behind a
  // canceller the next reconcile drops, so a component reconciling faster than it commits never
  // attached anything and a sticky header's rebuilt interpolation never reached the graph.
  // Regression-covered in leaf-attach-before-commit.test.ts.
  reconcile(props: Record<string, unknown>, wantsNative: boolean): void {
    const node = this.resolveNode();
    this.lifecycle.reconcile(props, node, wantsNative, bind =>
      node === null ? undefined : whenCommitted(node, bind),
    );
  }

  // Tear down everything: cancel a still-pending bind, drop native event listeners, detach the
  // current leaf from the value graph. Safe to call even if reconcile() was never called.
  destroy(): void {
    this.lifecycle.teardown();
  }
}
