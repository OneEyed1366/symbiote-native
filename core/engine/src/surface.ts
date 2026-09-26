// A surface is one mounted root: it owns the rootTag handed down by the native Fabric host and the
// top-level nodes under it. Adapters mutate it and ask it to commit.

// A surface is one ordinary node, and that is the whole implementation rather than a trick. It
// holds a real handle, its child ops are the ordinary append/insertBefore/removeChild, and
// OP_COMMIT names that one handle — so the host needs no rootTag -> node map, keeping it stateless.

// The node is RN's AppContainer (createSurfaceRoot in node.ts), so what reaches the root child set
// is one view with the app under it — the host takes it through the same call as any other node.

import type { IRootTag } from './fabric';
import { dlog } from './debug';
import { installEventHandler } from './events';
import { detachAnimatedProps } from './animated/host-binding';
import { childrenOf } from './host-access';
import {
  runCommittedHooks,
  runDeferredAttaches,
  hasDetachCandidates,
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

const NO_CO_COMMITTERS: readonly (readonly [IRootTag, ISymbioteNode])[] = [];

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

  // Every other live surface, so one commit names every root — see commitSurfaceOps. Static
  // because it reads a sibling instance's private handle, which only a member of this class may do.

  // self may already be out of the registry: a teardown unregisters and then commits, carrying the
  // removals — so the fast path can't be a size check, since size===1 could mean either surface.
  private static others(
    self: SymbioteSurface,
  ): readonly (readonly [IRootTag, ISymbioteNode])[] {
    let out: (readonly [IRootTag, ISymbioteNode])[] | undefined;
    for (const other of surfaces.values()) {
      if (other === self) continue;
      out ??= [];
      out.push([other.rootTag, other.node]);
    }
    return out ?? NO_CO_COMMITTERS;
  }

  // The top-level nodes, asked of the host. A getter rather than an array this class maintains: a
  // second copy of a child list is the thing this design removes.
  get children(): readonly ISymbioteNode[] {
    return childrenOf(this.node);
  }

  appendChild(child: ISymbioteNode): void {
    appendChild(this.node, child);
  }

  insertBefore(child: ISymbioteNode, beforeChild: ISymbioteNode): void {
    insertBefore(this.node, child, beforeChild);
  }

  // Nomination for teardown rides on node.ts's removeChild, and only nominates: a framework may
  // spell a move as remove-then-reinsert, so the commit sweep decides.
  removeChild(child: ISymbioteNode): void {
    removeChild(this.node, child);
  }

  clear(): void {
    for (const child of this.children) removeChild(this.node, child);
  }

  // Release every host behavior still standing under this surface, at unmount. The sweep above
  // can't answer this: it only sees nodes removeChild nominated, and an unmount removes nothing —
  // the adapter drops the whole surface.
  teardown(): void {
    // The nominations first: an adapter that empties and disposes the surface without a commit in
    // between never reaches the commit sweep, and the walk below can't see those nodes either.
    sweepDetachedBehaviors(this.children, detachAnimatedProps);
    teardownSubtree(this.node, detachAnimatedProps);
  }

  // Synchronous commit: used by React's resetAfterCommit, which already batches per logical update.
  commit(): void {
    // A superseded surface still flushes its ops and names every other root (its teardown carries
    // the removals), but must not complete a root another surface now owns — Fast Refresh and the
    // focus lifecycle can re-mount the same rootTag while an old teardown commit is still pending.

    // The behavior-teardown half runs after ops are applied (asking the host for a parent needs the
    // removal already handed over) but before the root completes, so a behavior's parting writes
    // ride this commit instead of owing another one. flushOps is that split: apply, don't publish.
    flushOps();
    // Guarded at the call site, not inside the sweep — this.children is a host read that builds the
    // whole top-level list, and it would run on every commit for a sweep with nothing to do.
    if (hasDetachCandidates()) {
      sweepDetachedBehaviors(this.children, detachAnimatedProps);
    }
    const owner = surfaces.get(this.rootTag);
    const superseded = owner !== undefined && owner !== this;
    commitSurfaceOps(
      superseded ? undefined : this.rootTag,
      this.node,
      SymbioteSurface.others(this),
    );
    // Fresh Fabric handles are now assigned, so the three things that couldn't run before one
    // existed all drain here: notifyCommitted releases the imperative waiters, runPostCommitHooks
    // the consumers that needed a committed tag, runDeferredAttaches the same for a host behavior.
    notifyCommitted();
    runPostCommitHooks();
    runDeferredAttaches(isNodeCommitted);
    // After the setup half, never before: a node carrying both hooks has attachAfterCommit seed the
    // mirrors afterCommit then compares against. Unlike the two above, this asks only "props were
    // published", so it isn't gated on the commit having made native calls.
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

// Every live surface, so the microtask flush in imperative.ts can commit the one a queued write
// named. Registered from here rather than imported there, keeping that dependency one-directional.
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
