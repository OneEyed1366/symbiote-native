// The clone-on-write engine. Fabric is persistent: you never mutate a committed
// node, you clone it with new props/children and atomically hand a fresh child
// set to completeRoot.
//
// Incremental strategy: each retained node keeps, in its own `committed` field (node.ts), a
// mirror of what Fabric currently holds for it: its handle, the flat props last sent, the child
// identities last committed, and the resolved view name. On commit we walk the
// retained tree and only clone the nodes that actually changed; an untouched
// sibling subtree is reused by reference. That both skips work and preserves the
// native view state (scroll offset, text cursor) that a full rebuild would wipe
// on every commit. A change bubbles up: re-cloning a leaf
// forces each ancestor to re-clone too, because a persistent parent holds
// references to specific child handles. That bubble is inherent to a persistent
// tree and is exactly what React's own Fabric renderer does.

import {
  getSlot,
  type IFabricNode,
  type IFabricProps,
  type IRootTag,
  type IMeasureOnSuccess,
  type IMeasureInWindowOnSuccess,
  type IMeasureLayoutOnSuccess,
} from './fabric';
import {
  createElement,
  debugNodeId,
  isAnchor,
  isEmptyRawText,
  committedOf,
  markDirty,
  markPropsDirty,
  takePropStats,
  VIRTUAL_TEXT_COMPONENT,
  type IMirror,
  type ISymbioteNode,
} from './node';
import { dlog, isDebug } from './debug';
import { flattenStyle } from './style';
import { nextTag } from './tags';
import { registerPostCommit, runPostCommitHooks } from './post-commit';
import { fabricProps } from './fabric-props';
import { isRecord } from './type-guards';

// Re-exported from ./platform-color so callers don't need to change their import path.
export { processColor, setColorProcessor } from './platform-color';

// Per-commit work counters, surfaced via dlog so a device run can prove the
// engine is incremental (created=0 with clones after the first mount).
const stats = { created: 0, cloneProps: 0, cloneChildren: 0, reused: 0 };

// Cumulative cost of the reconcile walk. Unlike `stats` (per-commit, zeroed at the top of every
// commit), this ACCUMULATES: one scroll frame produces a burst of commits and the frame's real cost
// is only visible as their sum. Read-and-zeroed via readCommitProfile().
//
// Deliberately NOT gated behind isDebug(): two performance.now() calls per commit are noise next to
// the walk they measure, and the number is only meaningful from a RELEASE build - dev-mode JS
// drowns the signal. The dlog below stays gated as usual.
// `propsBuilt` / `propsReused` price the props half of the walk, and they exist because that half
// is INVISIBLE in the output: reusing the mirror's payload by reference and rebuilding a
// byte-identical one emit the same Fabric calls, so only a counter separates a working fast lane
// from a silently reverted one. `propsBuilt` counts fabricProps() calls made by the update path
// (a fresh object plus a recursive propsEqual); `propsReused` counts nodes that re-cloned for a
// child's sake and carried the committed payload through untouched. On an ordinary update the
// second should dominate - that ratio IS the clone-bubble.
//
// The create path is deliberately not counted in either: it has no committed payload to reuse, so
// its fabricProps() calls are not a cost any flag could remove and would only dilute the ratio.
const profile = {
  commits: 0,
  walkMs: 0,
  nodesVisited: 0,
  propsBuilt: 0,
  propsReused: 0,
};

// What `renderableChildren` costs, accumulated over the same window as `profile`. Anchors are the
// only reason that function is not free, and how many a tree carries is a property of the ADAPTER,
// not of the app: a Vue/React/Svelte/Solid component is a function returning children and allocates
// no node, while an Angular component is bound to a host ELEMENT and therefore always has one
// (anchor-host-registry.ts keeps it from painting). So the same screen is a no-anchor tree under
// four adapters and an anchor-per-composed-component tree under the fifth, and only a counter tells
// them apart at runtime - a source-level grep for "anchor" measures instrumentation density, not
// trees.
//
// `scans` counts invocations; `probed` counts children actually examined by the fast-path probe,
// which is why that probe is a counted loop rather than `.some()` (a `.some` short-circuits at the
// first anchor, so children.length would overstate a defeated scan by however much it skipped).
// `flattens` is the probe defeated: a fresh array, a second pass, and a recursion into every
// anchor. `widest` is the widest single flatten in the window, because a defeated scan over 3
// children is noise and one over 1000 is not - a count alone cannot separate them.
//
// Not gated behind isDebug(), for the same reason the rest of the profile is not: integer
// increments are noise next to the array work they price, and the number is only meaningful from a
// release build.
const childScan = {
  scans: 0,
  probed: 0,
  flattens: 0,
  flattenProbed: 0,
  widest: 0,
};

// Diagnostic (gated): Fabric serializes props to folly::dynamic, which rejects a JS
// Symbol or function with "JS Symbols are not convertible to dynamic". A hard native
// throw deep in cloneNode*. Walk a props payload and return the dotted path of the
// first non-serializable leaf (Symbol / function), or undefined when clean, so the
// offending key is named in logcat instead of a bare stack at the JSI boundary.
//
// Bounded on purpose: a real Fabric prop tree is shallow (style/transform ~depth 3) and
// a leaked React element trips at depth 2 (`children` -> element -> $$typeof). `seen`
// breaks reference cycles and DEPTH caps runaway nesting, so the diagnostic itself can
// never overflow the stack on cyclic props (an event-carrying handler, a self-referential
// style). A crashing guard would be worse than the bug it hunts.
const NON_SERIALIZABLE_SCAN_DEPTH = 6;
function firstNonSerializablePath(
  value: unknown,
  path: string,
  depth: number,
  seen: WeakSet<object>,
): string | undefined {
  const kind = typeof value;
  if (kind === 'symbol' || kind === 'function') return `${path}=<${kind}>`;
  if (depth >= NON_SERIALIZABLE_SCAN_DEPTH) return undefined;
  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    for (let index = 0; index < value.length; index += 1) {
      const found = firstNonSerializablePath(
        value[index],
        `${path}[${index}]`,
        depth + 1,
        seen,
      );
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (isRecord(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    for (const key of Object.keys(value)) {
      const next = path === '' ? key : `${path}.${key}`;
      const found = firstNonSerializablePath(value[key], next, depth + 1, seen);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

// Name the offending prop before the JSI boundary throws. Gated, so the deep walk only
// runs while debugging; in production the clone proceeds straight to native.
function guardSerializable(
  propsDiff: IFabricProps,
  viewName: string,
  tag: number,
): void {
  if (!isDebug()) return;
  const bad = firstNonSerializablePath(propsDiff, '', 0, new WeakSet());
  if (bad !== undefined)
    dlog(`NON-SERIALIZABLE prop on ${viewName}#${tag}: ${bad}`);
}

function viewNameFor(node: ISymbioteNode, hasTextAncestor: boolean): string {
  // The only position-dependent name: a <Text> inside another <Text> becomes a
  // virtual span. Everything else is the component string the adapter chose.
  return node.isText && hasTextAncestor
    ? VIRTUAL_TEXT_COMPONENT
    : node.component;
}

// Fabric's clone*WithNewProps MERGES the raw payload onto the node's existing props,
// so the payload must be a MINIMAL diff: only the keys that actually changed, plus any
// key the node held last time but no longer has, sent as `null` so Fabric resets it to
// default (e.g. `opacity` when a pressed style releases). Mirror React's diffProperties
// exactly: re-sending an UNCHANGED key is not a no-op, it re-invokes that prop's native
// setter, and some ViewManagers rebuild on any set. AndroidProgressBar's `styleAttr`
// setter recreates the whole ProgressBar via setStyle(), so re-sending it on an
// animating-only toggle dropped and rebuilt the spinner each time, and it never came
// back. Only matters for clones: a fresh createNode starts from nothing.
function diffProps(previous: IFabricProps, next: IFabricProps): IFabricProps {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (!jsonEqual(previous[key], next[key])) out[key] = next[key];
  }
  for (const key of Object.keys(previous)) {
    if (!(key in next)) out[key] = null;
  }
  return out;
}

// Deep structural equality over the JSON-shaped props payload (Fabric props are
// serializable: primitives, arrays, plain objects). Used to decide whether a
// node's props actually changed: `fabricProps` builds a fresh object each
// commit, so a reference check would report every node as dirty.
function propsEqual(a: IFabricProps, b: IFabricProps): boolean {
  return jsonEqual(a, b);
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  const aArray = Array.isArray(a);
  const bArray = Array.isArray(b);
  if (aArray && bArray) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => jsonEqual(value, b[index]));
  }
  if (aArray || bArray) return false;
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(key => key in b && jsonEqual(a[key], b[key]));
}

// The committed-state record (IMirror) and its guarded accessor (committedOf) live on the node
// itself, in node.ts - see the `committed` field there for why the side table was collapsed into a
// field, and committedOf's doc comment for the node-identity check that replaced the WeakMap miss.
// Everything below reads it exclusively through committedOf and writes it as `node.committed`.

interface IReconciled {
  handle: IFabricNode;
  changed: boolean;
}

function isSkippedAtCommit(node: ISymbioteNode): boolean {
  return isAnchor(node) || isEmptyRawText(node);
}

function renderableChildren(node: ISymbioteNode): readonly ISymbioteNode[] {
  // Anchor nodes (Vue fragment/v-if/v-for placeholders, Angular component hosts that should
  // not paint) live in the retained tree for sibling ordering but never become Fabric views.
  // When an anchor owns children, flatten them into the parent's renderable list: this lets a
  // DOM-less framework use an anchor as a fragment/component host without adding a native
  // wrapper node. Fast path: no anchors reuses the array, so the common case allocates nothing.
  // An empty raw text is skipped for a different reason and with no flattening: it has no
  // children, and committing it aborts the app inside Fabric's text walk (isEmptyRawText).
  //
  // The probe is a counted loop rather than `.some()` only so childScan can price it honestly;
  // see the childScan declaration for what the five counters mean and what they were built to
  // settle.
  childScan.scans += 1;
  const total = node.children.length;
  let index = 0;
  while (index < total && !isSkippedAtCommit(node.children[index])) index += 1;
  // The defeating child was examined too, so it counts.
  childScan.probed += index === total ? total : index + 1;
  if (index === total) return node.children;

  childScan.flattens += 1;
  childScan.flattenProbed += total;
  if (total > childScan.widest) childScan.widest = total;

  const children: ISymbioteNode[] = [];
  for (const child of node.children) {
    if (isSkippedAtCommit(child)) {
      // A skipped child is flattened away here and never reaches reconcile, so this is the only
      // place that can clear its dirty flag. Leaving it set would be a silent stale-UI bug:
      // markDirty stops at the first dirty ancestor, so a permanently-dirty skipped node swallows
      // every later mark - from an anchor's subtree, or from the setText that turns an empty raw
      // text back into real content - and the real parent never learns anything changed.
      child.dirty = false;
      if (isAnchor(child)) children.push(...renderableChildren(child));
    } else children.push(child);
  }
  return children;
}

function childrenIdentical(
  kids: readonly ISymbioteNode[],
  committed: readonly ISymbioteNode[],
): boolean {
  if (kids.length !== committed.length) return false;
  return kids.every((child, index) => child === committed[index]);
}

// Diagnostic seam (gated): a ScrollView on Android must hold exactly ONE direct
// child (its content container), or the native mount aborts with "ScrollView can
// host only one direct child". Logged after children reconcile so each child's
// committed tag/view-name is resolved. A `MULTI!!` line names the exact extra
// node (tag + view-name) that pushed the scroll view past one child.
function logScrollChildren(
  node: ISymbioteNode,
  viewName: string,
  selfTag: number | string,
): void {
  if (!viewName.includes('Scroll') || viewName.includes('Content')) return;
  const kids = node.children.map(child => {
    const committed = committedOf(child);
    return `${committed?.viewName ?? child.component}#${committed?.tag ?? 'NEW'}`;
  });
  const flag = kids.length === 1 ? 'OK' : 'MULTI!!';
  dlog(
    `SCROLL-${flag} ${viewName} tag=${selfTag} children(${kids.length})=[${kids.join(',')}]`,
  );
}

// The failure mode dirty-marking introduces: a mutation path that forgets to markDirty leaves a
// node whose desired props have drifted from what Fabric holds, and the screen silently keeps
// showing the old value - no error, no crash, nothing to grep for. So under DEBUG pay back the full
// price just saved and verify the skip was honest, naming the node loudly enough to find the
// missing mark.
//
// Two lanes reach it, and naming which one fired matters when reading a log: `subtree` is the whole
// node skipped because nothing under it was marked, `props` is the node re-cloned for a child's
// sake but its own payload reused because no prop write was recorded on it. They point at
// different missing marks - markDirty vs markPropsDirty - so the line says which.
function warnIfStale(
  node: ISymbioteNode,
  committed: IMirror,
  lane: 'subtree' | 'props',
): void {
  if (!isDebug()) return;
  const fresh = fabricProps(node);
  if (propsEqual(committed.props, fresh)) return;
  dlog(
    `DIRTY-MISS(${lane}) ${committed.viewName}#${committed.tag} node=${debugNodeId(node)} ` +
      `treated as clean but props differ: committed=${JSON.stringify(committed.props)} ` +
      `desired=${JSON.stringify(fresh)}`,
  );
}

function reconcile(
  slot: ReturnType<typeof getSlot>,
  node: ISymbioteNode,
  rootTag: IRootTag,
  hasTextAncestor: boolean,
  renderableParent: ISymbioteNode | undefined,
  forceFreshFamily: boolean,
): IReconciled {
  profile.nodesVisited += 1;
  const viewName = viewNameFor(node, hasTextAncestor);
  const committed = committedOf(node);

  // Nothing under here changed: hand back the committed handle without rebuilding this node's
  // Fabric props or descending into it at all. The walk below costs ~13 us/node on device, and an
  // untouched sibling subtree would pay it on every commit. `committed.parent` is re-checked rather
  // than trusted to the flag because a MOVED node can still be legitimately clean (see node.ts's
  // structural ops), and a reparent must fall through to the fresh-family path below.
  if (
    !forceFreshFamily &&
    !node.dirty &&
    committed !== undefined &&
    committed.parent === renderableParent &&
    committed.viewName === viewName
  ) {
    stats.reused += 1;
    warnIfStale(node, committed, 'subtree');
    return { handle: committed.handle, changed: false };
  }
  node.dirty = false;
  // Read before clearing. The create path below ignores it - a node Fabric has never seen needs its
  // whole payload built regardless - so this only ever gates the update path.
  const ownPropsChanged = node.propsDirty;
  node.propsDirty = false;

  const childInText = node.isText || hasTextAncestor;
  const kids = renderableChildren(node);

  // First mount, or the view kind flipped (RCTText <-> RCTVirtualText when a
  // <Text> moves in or out of another <Text>): a different native component
  // can't be cloned across, so create a fresh node from scratch.
  const parentChanged =
    committed !== undefined && committed.parent !== renderableParent;

  if (
    forceFreshFamily ||
    committed === undefined ||
    committed.viewName !== viewName ||
    parentChanged
  ) {
    stats.created += 1;
    // Full payload: there is no committed props object to reuse, whatever propsDirty said.
    const props = fabricProps(node);
    const tag = nextTag();
    const reason =
      committed === undefined
        ? 'mount'
        : forceFreshFamily
          ? 'fresh-parent'
          : committed.viewName !== viewName
            ? 'view-kind'
            : 'reparent';
    dlog(
      `commit root=${rootTag} createNode tag=${tag} view=${viewName} reason=${reason}`,
    );
    if (viewName === 'RCTView' || viewName === 'RCTText') {
      dlog(
        `commit root=${rootTag} colorProbe tag=${tag} view=${viewName} ` +
          `bg=${JSON.stringify(props.backgroundColor)} color=${JSON.stringify(props.color)} ` +
          `opacity=${JSON.stringify(props.opacity)}`,
      );
    }
    if (
      viewName === 'AndroidSwipeRefreshLayout' ||
      viewName === 'RCTScrollView'
    ) {
      dlog(
        `commit root=${rootTag} layoutProbe tag=${tag} view=${viewName} ` +
          `flex=${JSON.stringify(props.flex)} height=${JSON.stringify(props.height)} ` +
          `width=${JSON.stringify(props.width)} minHeight=${JSON.stringify(props.minHeight)} ` +
          `flexGrow=${JSON.stringify(props.flexGrow)}`,
      );
    }
    const handle = slot.createNode(tag, viewName, rootTag, props, node);
    for (const child of kids) {
      slot.appendChild(
        handle,
        reconcile(slot, child, rootTag, childInText, node, true).handle,
      );
    }
    logScrollChildren(node, viewName, tag);
    // Investigation instrumentation (search-bar-ref "node not committed" bug): scoped to RNS* so
    // it can be directly compared against the ref-attach log in stack.ts and the dispatch-miss
    // log below — same debugNodeId on both sides proves/disproves an identity mismatch. Kept
    // behind DEBUG per <keep_logs_gate_behind_DEBUG>, never removed.
    if (viewName.startsWith('RNS')) {
      dlog(
        `committed (create) node=${debugNodeId(node)} tag=${tag} view=${viewName}`,
      );
    }
    node.committed = {
      handle,
      tag,
      rootTag,
      props,
      children: kids.slice(),
      viewName,
      parent: renderableParent,
      owner: node,
    };
    return { handle, changed: true };
  }

  // Reconcile children first; a child that re-cloned forces this node to re-clone
  // too, since Fabric parents point at specific child handles.
  const childHandles: IFabricNode[] = [];
  let descendantChanged = false;
  for (const child of kids) {
    const result = reconcile(slot, child, rootTag, childInText, node, false);
    childHandles.push(result.handle);
    if (result.changed) descendantChanged = true;
  }
  logScrollChildren(node, viewName, committed.tag);

  const childrenChanged =
    !childrenIdentical(kids, committed.children) || descendantChanged;

  // The fast lane. No prop write was recorded on this node since its last commit, so its Fabric
  // payload is by construction the one the mirror already holds: reuse that object by reference -
  // no rebuild, no allocation, no deep compare - and carry it into the mirror below untouched.
  //
  // This is what propsDirty (node.ts) exists for. Every node on the clone-bubble path from a
  // changed leaf up to the root takes this branch, as does the synthetic container that
  // commitContainer dirties at every single entry. They still re-clone - a persistent parent must
  // point at the new child handles - they just stop paying `fabricProps` + a recursive `propsEqual`
  // to rediscover that nobody touched them.
  //
  // Under DEBUG the saving is handed straight back to check it was honest: an in-place mutation of
  // a style object or of node.props, which no flag can observe, is the same hazard warnIfStale
  // already guards on the skip path, and this lane is open to it identically.
  let props: IFabricProps;
  let propsChanged: boolean;
  if (ownPropsChanged) {
    profile.propsBuilt += 1;
    props = fabricProps(node);
    propsChanged = !propsEqual(committed.props, props);
  } else {
    profile.propsReused += 1;
    props = committed.props;
    propsChanged = false;
    warnIfStale(node, committed, 'props');
  }

  if (!childrenChanged && !propsChanged) {
    stats.reused += 1;
    return { handle: committed.handle, changed: false };
  }

  let handle: IFabricNode;
  if (childrenChanged) {
    stats.cloneChildren += 1;
    if (propsChanged) {
      const propsDiff = diffProps(committed.props, props);
      guardSerializable(propsDiff, viewName, committed.tag);
      handle = slot.cloneNodeWithNewChildrenAndProps(
        committed.handle,
        propsDiff,
      );
    } else {
      handle = slot.cloneNodeWithNewChildren(committed.handle);
    }
    for (const childHandle of childHandles) {
      slot.appendChild(handle, childHandle);
    }
  } else {
    stats.cloneProps += 1;
    const propsDiff = diffProps(committed.props, props);
    guardSerializable(propsDiff, viewName, committed.tag);
    handle = slot.cloneNodeWithNewProps(committed.handle, propsDiff);
  }

  // Investigation instrumentation (search-bar-ref "node not committed" bug): see the create-path
  // dlog above. Kept behind DEBUG per <keep_logs_gate_behind_DEBUG>, never removed.
  if (viewName.startsWith('RNS')) {
    dlog(
      `committed (update) node=${debugNodeId(node)} tag=${committed.tag} view=${viewName}`,
    );
  }
  // The clone keeps the node's family, so its reactTag is unchanged; carry it.
  node.committed = {
    handle,
    tag: committed.tag,
    rootTag,
    props,
    // Store the same flattened child list we diffed against. Anchors are retained-tree
    // bookkeeping only; keeping raw node.children here makes every anchored subtree look
    // structurally changed on the next commit and can re-append already-parented Fabric
    // ShadowNode families under a cloned parent.
    children: kids.slice(),
    viewName,
    parent: renderableParent,
    owner: node,
  };
  return { handle, changed: true };
}

// One persistent synthetic root container per surface, mirroring RN's AppContainer
// (renderApplication wraps the app in `<View style={{flex:1}} pointerEvents="box-none">`).
// Without it a non-flex root view collapses to content height, and touches outside the
// app's children have no box-none escape. Keeping it here (not in each adapter's
// mount()) gives every framework a full-screen flex root for free and keeps layout in
// shared (adapters_stay_thin). The container is just another persistent node in the
// clone-on-write engine: stable identity, so an unchanged subtree leaves it un-cloned.
const ROOT_VIEW_COMPONENT = 'RCTView';
const ROOT_CONTAINER_STYLE = { flex: 1 };
const ROOT_CONTAINER_POINTER_EVENTS = 'box-none';

const rootContainers = new Map<IRootTag, ISymbioteNode>();

function rootContainerFor(rootTag: IRootTag): ISymbioteNode {
  let container = rootContainers.get(rootTag);
  if (container === undefined) {
    container = createElement(ROOT_VIEW_COMPONENT);
    container.props = {
      style: ROOT_CONTAINER_STYLE,
      pointerEvents: ROOT_CONTAINER_POINTER_EVENTS,
    };
    rootContainers.set(rootTag, container);
    dlog(`root container created root=${rootTag} (flex:1, box-none)`);
  }
  return container;
}

// Drop a surface's persistent root container so the NEXT mount on this rootTag starts
// from scratch (fresh tags, fresh mirror) instead of cloning handles that belonged to a
// now-stopped surface. Called from unmount (the bridgeless surface-stop path): the host stops then restarts a
// surface (Fast Refresh, focus/lifecycle) reusing the same rootTag, and a stale root
// container would re-clone dead handles into the new surface -> a blank screen. The old
// container's descendants fall out of every reference and are collected with the committed
// records they carry.
export function disposeRoot(rootTag: IRootTag): void {
  if (rootContainers.delete(rootTag))
    dlog(`root container disposed root=${rootTag}`);
}

export function commitChildren(
  rootTag: IRootTag,
  children: readonly ISymbioteNode[],
): void {
  // The wrapper holds the surface's top-level children; reconcile walks from it so the
  // whole tree, synthetic root included, goes through the same clone-on-write path.
  rootContainerFor(rootTag).children = children.slice();
  commitContainer(rootTag);
}

// Re-run the scoped commit for a surface from its synthetic root container, reusing
// whatever top-level children it currently holds. The shared half of the engine: both
// a full mutation->commit and a single-node Animated frame (setNativeProps) funnel here.
function commitContainer(rootTag: IRootTag): void {
  const slot = getSlot();
  const container = rootContainerFor(rootTag);

  // The synthetic container is dirtied here, at the one entry point, because markDirty can never
  // bubble up to it: a surface's top-level nodes carry `parent === undefined` (surface.ts sets it
  // deliberately), so a mark stops at the top-level node and the container above it stays clean -
  // it would then early-exit and swallow the whole commit. Marking unconditionally costs one node's
  // props rebuild per commit and closes the hole for both callers, mutation commit and
  // setNativeProps alike.
  markDirty(container);

  stats.created = 0;
  stats.cloneProps = 0;
  stats.cloneChildren = 0;
  stats.reused = 0;
  // Entry seam: brackets reconcile with the `reconciled` line below. If `start` prints
  // but `reconciled` never does, the stall is inside reconcile (a JS loop/cycle in the
  // tree walk); if `start` itself never prints, the stall is upstream: React's commit
  // phase or the mutation ops before we are even called.
  dlog(`commit root=${rootTag} start children=${container.children.length}`);
  const walkStart = performance.now();
  const result = reconcile(slot, container, rootTag, false, undefined, false);
  const walkMs = performance.now() - walkStart;
  profile.walkMs += walkMs;
  profile.commits += 1;
  // Boundary seam: prints once reconcile returns. If a commit hangs and this line
  // never appears, the stall is inside reconcile (JS); if it appears but the
  // post-completeRoot line below never does, the stall is inside the native commit.
  dlog(`commit root=${rootTag} reconciled changed=${result.changed}`);

  // The container's identity is stable, so its un-cloned flag is the no-op signal:
  // an over-scheduled commit that touched nothing makes zero native calls.
  if (!result.changed) {
    dlog(`commit root=${rootTag} no-op (skipped completeRoot)`);
    return;
  }

  const childSet = slot.createChildSet(rootTag);
  slot.appendChildToSet(childSet, result.handle);
  dlog(`commit root=${rootTag} pre-completeRoot`);
  slot.completeRoot(rootTag, childSet);

  // Fresh Fabric tags are now assigned: let any consumer that needed a committed tag
  // and ran too early (the Animated native driver binding a props node to a view under
  // an async-batched commit) retry now. No-op when nothing is pending.
  runPostCommitHooks();

  if (isDebug()) {
    const mode =
      stats.created > 0 && stats.reused === 0 ? 'full' : 'incremental';
    dlog(
      `commit root=${rootTag} ${mode} ` +
        `created=${stats.created} cloneProps=${stats.cloneProps} ` +
        `cloneChildren=${stats.cloneChildren} reused=${stats.reused} ` +
        `propsBuilt=${profile.propsBuilt} propsReused=${profile.propsReused} ` +
        `walk=${walkMs.toFixed(3)}ms`,
    );
  }
}

// What the reconcile walk cost on this host since the last read. Hermes on a device is materially
// slower than V8 on a laptop and sizing that multiplier is the whole reason this exists; `commits`
// separates one expensive commit from a burst of cheap ones inside a frame. Reading zeroes the
// accumulator, so a sampler on an interval gets disjoint windows rather than a growing total.
//
// `propWrites` / `propNoops` come from setProp (node.ts) and price the layer ABOVE the walk: how
// many prop writes an adapter pushed at the engine in this window, and how many of those asked for
// a value the node already held. A high `propNoops` says the adapter is re-pushing an unchanged
// bag; the guard absorbs the cost, but the number is the only place the churn is visible at all.
//
// `childScans` / `childFlattens` price renderableChildren, the one part of the walk whose cost is
// set by WHICH ADAPTER is driving rather than by the app: see the childScan comment above. Read
// them as a pair — `childFlattens / childScans` is the share of scans an anchor defeated, and
// `childFlattenWidest` says whether any of them was wide enough to matter.
export interface ICommitProfile {
  commits: number;
  walkMs: number;
  nodesVisited: number;
  /** Update-path nodes that rebuilt their Fabric payload and deep-compared it. */
  propsBuilt: number;
  /** Update-path nodes that re-cloned for a child but reused the committed payload by reference. */
  propsReused: number;
  propWrites: number;
  propNoops: number;
  childScans: number;
  childScanProbed: number;
  childFlattens: number;
  childFlattenProbed: number;
  childFlattenWidest: number;
}

export function readCommitProfile(): ICommitProfile {
  const props = takePropStats();
  const snapshot = {
    commits: profile.commits,
    walkMs: profile.walkMs,
    nodesVisited: profile.nodesVisited,
    propsBuilt: profile.propsBuilt,
    propsReused: profile.propsReused,
    propWrites: props.writes,
    propNoops: props.noops,
    childScans: childScan.scans,
    childScanProbed: childScan.probed,
    childFlattens: childScan.flattens,
    childFlattenProbed: childScan.flattenProbed,
    childFlattenWidest: childScan.widest,
  };
  profile.commits = 0;
  profile.walkMs = 0;
  profile.nodesVisited = 0;
  profile.propsBuilt = 0;
  profile.propsReused = 0;
  childScan.scans = 0;
  childScan.probed = 0;
  childScan.flattens = 0;
  childScan.flattenProbed = 0;
  childScan.widest = 0;
  return snapshot;
}

// Targeted per-frame prop write for the JS-driven Animated path. RN flushes an
// animation frame with an in-place `instance.setNativeProps(...)`; we have no
// in-place mutation (Fabric is persistent), so a frame is one scoped commit: mutate
// the node's desired props, then re-reconcile its surface. The engine clones only this
// node (props differ), bubbles the re-clone to the root, reuses every sibling subtree
// by reference, and emits a single completeRoot. This is the "slow tier", viable for a
// single shallow animation; driving the animation natively is the answer for scale.
export function setNativeProps(
  node: ISymbioteNode,
  partial: Record<string, unknown>,
): void {
  const record = committedOf(node);
  if (record === undefined) {
    dlog('setNativeProps skipped: node not committed');
    return;
  }
  for (const [key, value] of Object.entries(partial)) {
    if (key === 'style') {
      // A partial style override MERGES onto the declarative style (RN semantics):
      // setNativeProps({style:{backgroundColor}}) recolors without dropping height
      // or radius. Transient: the next React commit re-applies the full style.
      node.props.style = {
        ...flattenStyle(node.props.style),
        ...flattenStyle(value),
      };
    } else {
      node.props[key] = value;
    }
  }
  // Writes node.props directly rather than through setProp, so it owes its own mark - and it owes
  // the PROPS mark specifically: markDirty alone would send the node down the fast lane above,
  // which reuses the mirror's payload by reference and would drop the Animated frame entirely.
  markPropsDirty(node);
  dlog(
    `setNativeProps root=${record.rootTag} tag=${record.tag} keys=${Object.keys(partial)}`,
  );
  commitContainer(record.rootTag);
}

// The committed reactTag of a node (stable across clone-on-write), for binding the
// native Animated driver via connectAnimatedNodeToView. Undefined until the node
// has been committed at least once.
export function getNativeTag(node: ISymbioteNode): number | undefined {
  return committedOf(node)?.tag;
}

// Actions waiting for their node's first commit. An adapter that wires an imperative/native call at
// lifecycle time (autoFocus, a native Animated.event attach) can run BEFORE completeRoot under an
// async-batched commit (Vue/Svelte schedule it on a microtask), so the node has no tag yet and the
// call silently no-ops. Each waiter retries after a commit may have assigned the tag and is dropped
// once it runs. React commits synchronously, so its actions run inline and never land here.
const pendingCommitWaiters = new Set<() => boolean>();
registerPostCommit(() => {
  for (const waiter of pendingCommitWaiters) {
    if (waiter()) pendingCommitWaiters.delete(waiter);
  }
});

// Run `action` once `node` has a committed Fabric tag - immediately if it already does, else after
// the commit that assigns it. The canonical fix for the Vue async-commit race: defer instead of
// silently no-opping. Returns a cancel fn (drop the pending retry, e.g. on unmount).
export function whenCommitted(
  node: ISymbioteNode,
  action: () => void,
): () => void {
  const attempt = (): boolean => {
    if (committedOf(node) === undefined) return false;
    action();
    return true;
  };
  if (!attempt()) pendingCommitWaiters.add(attempt);
  return () => {
    pendingCommitWaiters.delete(attempt);
  };
}

// The node's current Fabric handle (the createNode/clone return value), identical in
// kind to React's stateNode.node, for the native driver's ShadowNodeFamily path.
export function getNativeNode(node: ISymbioteNode): IFabricNode | undefined {
  return committedOf(node)?.handle;
}

// Imperative view command (e.g. TextInput's setTextAndSelection / focus / blur),
// aimed at a node's CURRENT Fabric handle. Only valid once the node has been
// committed at least once; its handle is read from the node's committed record.
export function dispatchViewCommand(
  node: ISymbioteNode,
  commandName: string,
  args: readonly unknown[],
): void {
  const record = committedOf(node);
  if (record === undefined) {
    // node=... compares directly against the `committed (create|update)` logs above (same
    // debugNodeId scheme) to prove/disprove an identity mismatch — see the note there.
    dlog(
      `dispatchViewCommand "${commandName}" skipped: node not committed (node=${debugNodeId(node)} component=${node.component})`,
    );
    return;
  }
  dlog(`dispatchViewCommand "${commandName}" (node=${debugNodeId(node)})`);
  getSlot().dispatchCommand(record.handle, commandName, args);
}

// Emit an accessibility event (focus/click/viewHoverEnter/windowStateChange) at a node's
// CURRENT Fabric handle, routed through the slot exactly like dispatchViewCommand. RN's
// Fabric path hands the public-instance handle to nativeFabricUIManager.sendAccessibilityEvent
// with the STRING eventType; the C++ side maps it to the platform's accessibility-event kind.
// A no-op (logged) until the node is committed; there is no handle yet.
export function sendAccessibilityEvent(
  node: ISymbioteNode,
  eventType: string,
): void {
  const record = committedOf(node);
  if (record === undefined) {
    dlog(`sendAccessibilityEvent "${eventType}" skipped: node not committed`);
    return;
  }
  dlog(`sendAccessibilityEvent "${eventType}"`);
  getSlot().sendAccessibilityEvent(record.handle, eventType);
}

// Imperative measurement against a node's CURRENT Fabric handle (the public-instance
// measure family that reanimated / gesture-handler / scroll-to reach through). A
// no-op with a dlog until the node is committed; there is no handle to measure yet.
export function measure(
  node: ISymbioteNode,
  callback: IMeasureOnSuccess,
): void {
  const record = committedOf(node);
  if (record === undefined) {
    dlog('measure skipped: node not committed');
    return;
  }
  getSlot().measure(record.handle, callback);
}

export function measureInWindow(
  node: ISymbioteNode,
  callback: IMeasureInWindowOnSuccess,
): void {
  const record = committedOf(node);
  if (record === undefined) {
    dlog('measureInWindow skipped: node not committed');
    return;
  }
  getSlot().measureInWindow(record.handle, callback);
}

// Measure `node`'s frame relative to `relativeTo`. Both must be committed; RN's public
// signature is (relative, onSuccess, onFail) but the native slot wants the fail
// callback before success, so the order is swapped here.
export function measureLayout(
  node: ISymbioteNode,
  relativeTo: ISymbioteNode,
  onSuccess: IMeasureLayoutOnSuccess,
  onFail: () => void = () => {},
): void {
  const record = committedOf(node);
  const relativeRecord = committedOf(relativeTo);
  if (record === undefined || relativeRecord === undefined) {
    dlog('measureLayout skipped: a node is not committed');
    return;
  }
  getSlot().measureLayout(
    record.handle,
    relativeRecord.handle,
    onFail,
    onSuccess,
  );
}
