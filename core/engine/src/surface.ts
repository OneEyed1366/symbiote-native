// A surface is one mounted root: it owns the rootTag handed down by the native Fabric host and the
// top-level nodes under it. Adapters mutate it and ask it to commit.
//
// A SURFACE IS ONE ORDINARY NODE, and that is the whole implementation rather than a trick. It holds
// a real handle, its child ops are the ordinary append / insertBefore / removeChild, and `OP_COMMIT`
// names that one handle — so the host needs no `rootTag -> node` map, which is what keeps it
// stateless.
//
// The node is RN's AppContainer (`createSurfaceRoot` in `node.ts` — `flex: 1`, `box-none`), so what
// reaches the root child set is one view with the app under it. An ANCHOR in the same position
// hoists its children instead, and the host takes both through the same call, so nothing here is a
// special case.

import type { IRootTag } from './fabric';
import { dlog } from './debug';
import { installEventHandler } from './events';
import { detachAnimatedProps } from './animated/host-binding';
import { childrenOf } from './host-access';
import {
  runCommittedHooks,
  runDeferredAttaches,
  sweepDetachedBehaviors,
  teardownSubtree,
} from './host-behavior';
import {
  getNativeTag,
  notifyCommitted,
  registerSurfaceCommit,
} from './imperative';
import { runPostCommitHooks } from './post-commit';
import {
  appendChild,
  createSurfaceRoot,
  insertBefore,
  removeChild,
  type ISymbioteNode,
} from './node';
import { commitSurfaceOps, flushOps } from './tree-host';

const NO_CO_COMMITTERS: readonly (readonly [IRootTag, object])[] = [];

// The predicate both behavior drains take. Passed in rather than imported by `host-behavior.ts`,
// keeping that dependency one-directional — a cycle there is a live hazard under Metro's
// `inlineRequires`.
const isNodeCommitted = (node: ISymbioteNode): boolean =>
  getNativeTag(node) !== undefined;

export class SymbioteSurface {
  readonly rootTag: IRootTag;
  /** The AppContainer root every top-level node hangs off, and the handle `OP_COMMIT` names. */
  private readonly node: ISymbioteNode;
  private commitScheduled = false;

  constructor(rootTag: IRootTag) {
    this.rootTag = rootTag;
    this.node = createSurfaceRoot();
  }

  /**
   * Every OTHER live surface, so one commit names every root — see `commitSurfaceOps`.
   *
   * Static because it reads a sibling instance's private handle, which only a member of this class
   * may do. One surface — the universal case — allocates nothing.
   *
   * `self` may already be OUT of the registry: a teardown unregisters and then commits, and that
   * commit is the one carrying the removals. So the fast path cannot be a size check — with one
   * live surface left, `size === 1` means either "only me" or "only the other one", and taking the
   * shortcut on the second reading is how a surface loses the very batch that empties it.
   */
  private static others(
    self: SymbioteSurface,
  ): readonly (readonly [IRootTag, object])[] {
    let out: (readonly [IRootTag, object])[] | undefined;
    for (const other of surfaces.values()) {
      if (other === self) continue;
      out ??= [];
      out.push([other.rootTag, other.node]);
    }
    return out ?? NO_CO_COMMITTERS;
  }

  /**
   * The top-level nodes, asked of the host.
   *
   * A getter rather than an array this class maintains: a second copy of a child list is the thing
   * this design removes, and `nextSiblingOf` (host-access.ts) needs the same answer the host gives
   * for a parented node.
   */
  get children(): readonly ISymbioteNode[] {
    return childrenOf(this.node);
  }

  appendChild(child: ISymbioteNode): void {
    appendChild(this.node, child);
  }

  insertBefore(child: ISymbioteNode, beforeChild: ISymbioteNode): void {
    insertBefore(this.node, child, beforeChild);
  }

  // Nomination for teardown rides on `node.ts`'s `removeChild`, and only NOMINATES for the reason
  // stated there: a framework may spell a move as remove-then-reinsert, so the commit sweep
  // decides. The surface is one ordinary node, so it is not a second removal path that could miss
  // the sweep and leave a behavior — its timers included — outliving the surface.
  removeChild(child: ISymbioteNode): void {
    removeChild(this.node, child);
  }

  clear(): void {
    for (const child of this.children) removeChild(this.node, child);
  }

  /**
   * Release every host behavior still standing under this surface, at unmount.
   *
   * The sweep above cannot answer this: it only sees nodes a `removeChild` NOMINATED, and an
   * unmount removes nothing — the adapter drops the whole surface. Without it every node keeps its
   * `afterCommit` registration and its timers, and a restarted surface's commits drain the dead
   * one's hooks forever.
   */
  teardown(): void {
    // The nominations first: an adapter that empties the surface and disposes it without a commit
    // in between (React's `clearContainer`) never reaches the commit sweep, and the walk below
    // cannot see those nodes either — they already left the tree.
    sweepDetachedBehaviors(this.children, detachAnimatedProps);
    teardownSubtree(this.node, detachAnimatedProps);
  }

  // Synchronous commit: used by React's resetAfterCommit, which already batches per logical update.
  commit(): void {
    // A SUPERSEDED surface still flushes its ops and still names every other root — its teardown is
    // what carries the removals — but it must not complete a root another surface now owns. Fast
    // Refresh and the focus lifecycle re-mount the same rootTag, so the old surface's teardown
    // commit lands AFTER the new one's mount commit and would hand Fabric the emptied tree.
    // An UNREGISTERED surface is not superseded — nobody took the root, so its final emptied tree
    // is still the truth for it. Only a live OTHER owner suppresses the op.
    // The teardown half of the behavior lifecycle. It runs AFTER the ops are applied — it decides
    // what really left by asking the host for a parent, and the host does not know about a removal
    // it has not been handed — but BEFORE the root is completed, so a behavior's parting writes
    // (ScrollView taking its forced `scrollEventThrottle` back) ride this commit instead of owing
    // another one. `flushOps` is that split: apply, do not publish.
    //
    // `removeChild` only NOMINATES — a framework spells a move as remove-then-reinsert, so tearing
    // down at the call would kill a machine that comes back in the same batch.
    flushOps();
    sweepDetachedBehaviors(this.children, detachAnimatedProps);
    const owner = surfaces.get(this.rootTag);
    const superseded = owner !== undefined && owner !== this;
    commitSurfaceOps(
      superseded ? undefined : this.rootTag,
      this.node,
      SymbioteSurface.others(this),
    );
    // Fresh Fabric handles are now assigned, so the three things that could not run before one
    // existed all drain here — this is the moment the old `commitChildren` drained them too.
    //
    // `notifyCommitted` releases the imperative waiters (`whenCommitted`); `runPostCommitHooks` the
    // consumers that needed a committed TAG and ran too early, which is the Animated native driver
    // binding a props node under an async-batched commit; `runDeferredAttaches` the half of a host
    // behavior whose setup needs a tag (a view command, an event attach). The predicate is passed in
    // rather than imported by `host-behavior.ts`, keeping that dependency one-directional — a cycle
    // there is a live hazard under Metro's `inlineRequires`.
    notifyCommitted();
    runPostCommitHooks();
    runDeferredAttaches(isNodeCommitted);
    // After the setup half, never before it: a node carrying both hooks has `attachAfterCommit`
    // seed the mirrors `afterCommit` then compares against. Unlike the two above it asks only
    // "props were published", so it is NOT gated on the commit having made native calls — a fold
    // that strips a prop makes its own commit byte-identical, and the hook that must react to the
    // flip would be the one the flip cannot wake.
    runCommittedHooks(isNodeCommitted);
  }

  // Coalesced commit: for reactive frameworks that emit many mutations per tick. Collapses to a
  // single completeRoot at the microtask boundary.
  requestCommit(): void {
    if (this.commitScheduled) return;
    this.commitScheduled = true;
    queueMicrotask(() => {
      this.commitScheduled = false;
      this.commit();
    });
  }
}

// Every live surface, so the microtask flush in `imperative.ts` can commit the one a queued write
// named. Registered from here rather than imported there: a surface owns its own commit, and
// reaching into it from the imperative half would put back the cycle that split exists to remove.
const surfaces = new Map<IRootTag, SymbioteSurface>();

registerSurfaceCommit(
  rootTag => {
    surfaces.get(rootTag)?.commit();
  },
  rootTag => {
    const surface = surfaces.get(rootTag);
    surfaces.delete(rootTag);
    surface?.teardown();
  },
);

export function createSurface(rootTag: IRootTag): SymbioteSurface {
  installEventHandler();
  const surface = new SymbioteSurface(rootTag);
  surfaces.set(rootTag, surface);
  dlog(`surface created root=${rootTag}`);
  return surface;
}
