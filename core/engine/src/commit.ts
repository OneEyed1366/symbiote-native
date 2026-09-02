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
  markStructureDirty,
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
import { isAriaAliasKey } from './accessibility-props';
import { runDeferredAttaches, sweepDetachedBehaviors } from './host-behavior';

// Re-exported from ./platform-color so callers don't need to change their import path.
export { processColor, setColorProcessor } from './platform-color';

// Per-commit work counters, surfaced via dlog so a device run can prove the
// engine is incremental (created=0 with clones after the first mount).
const stats = { created: 0, cloneProps: 0, cloneChildren: 0, reused: 0 };

// TEMPORARY, for one measurement. Batching the CREATE path is a trade — it removes N-1 JSI
// crossings per parent and adds one discarded ShadowNode — and its sign is a native-side question.
// Comparing two builds cannot answer it: the same benchmark screen on UNCHANGED stock code drifted
// 4% on Create and 6x on Clear between two Release runs, which is larger than the effect. So the
// two arms have to be compared against each other on ONE binary, in one session, and that needs a
// runtime switch rather than a compile-time constant.
//
// Read once per commit into `batchCreate`, not per node: a global property lookup on the per-node
// create path is exactly the kind of cost this experiment is trying to measure.
// Delete both this and the screen toggle once the measurement lands.
declare global {
  var __SYMBIOTE_BATCH_CREATE__: boolean | undefined;
}
// One append vs one clone is a wash by call count and a pure loss by allocation, so a parent with a
// single child never takes the batched route whatever the switch says.
const CREATE_BATCH_MIN_CHILDREN = 2;
let batchCreate = false;

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
  // The whole function is a dlog, and it is called on every reconciled node, so the cheap boolean
  // goes first: with logging off this is one property read instead of two string scans per node.
  if (!isDebug()) return;
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
  // Cleared here because this call is what re-snapshots `committed.children` below, on both the
  // create and the update path. Anything that reads that snapshot afterwards is reading a current
  // one until the next structural op raises the flag again.
  node.structureDirty = false;

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
    // One gate for the whole diagnostic block, not three dlog calls. This runs once per CREATED
    // node - 9 000 of them on one benchmark press - and dlog cannot help here: its argument is
    // built at the CALL SITE (see debug.ts), so an eager template pays in full with logging off,
    // and a thunk trades that for a closure allocation per node. A plain `if` costs neither.
    if (isDebug()) {
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
    }
    const created = slot.createNode(tag, viewName, rootTag, props, node);
    // `createNode` takes no children (UIManagerBinding.cpp gives it 5 params), so a fresh parent
    // can only receive them one `appendChild` at a time — unless we spend a clone to hand the whole
    // list over at once. That is a TRADE, not a win: it removes N-1 JSI crossings and adds one
    // discarded ShadowNode per parent, and which side wins is a native-side question no headless
    // bench can answer. Hence the switch: off, this is byte-for-byte the append loop.
    //
    // Below the threshold the trade is a wash by call count (1 append vs 1 clone) and pure loss by
    // allocation, so a single-child parent never takes it.
    let handle = created;
    if (batchCreate && kids.length >= CREATE_BATCH_MIN_CHILDREN) {
      const childHandles: IFabricNode[] = [];
      for (const child of kids) {
        childHandles.push(
          reconcile(slot, child, rootTag, childInText, node, true).handle,
        );
      }
      handle = slot.cloneNodeWithNewChildren(created, childHandles);
    } else {
      for (const child of kids) {
        slot.appendChild(
          created,
          reconcile(slot, child, rootTag, childInText, node, true).handle,
        );
      }
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
    // `kids` is stored BY REFERENCE, not copied. With no anchors it IS `node.children`, so the
    // record aliases the live array until the next structural op, which copies it out of the way
    // (markStructureDirty, node.ts). Slicing here instead cost one array per node per commit -
    // 9 002 on a 1 000-row create - and all but the handful of nodes that go on to change threw
    // theirs away unread.
    node.committed = {
      handle,
      tag,
      rootTag,
      props,
      children: kids,
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
    // A clone comes back with an EMPTY child list, so every sibling handle has to be handed back
    // one by one — that loop is why touching one row of a thousand costs a thousand JSI crossings
    // at every level up to the root. Where the host accepts the list in the clone call itself it
    // becomes ONE crossing (see supportsCloneWithChildren in fabric.ts).
    const batched = slot.supportsCloneWithChildren;
    if (propsChanged) {
      const propsDiff = diffProps(committed.props, props);
      guardSerializable(propsDiff, viewName, committed.tag);
      handle = slot.cloneNodeWithNewChildrenAndProps(
        committed.handle,
        propsDiff,
        batched ? childHandles : undefined,
      );
    } else {
      handle = slot.cloneNodeWithNewChildren(
        committed.handle,
        batched ? childHandles : undefined,
      );
    }
    if (!batched) {
      for (const childHandle of childHandles) {
        slot.appendChild(handle, childHandle);
      }
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
  // Written IN PLACE rather than as a fresh record. The node is the same node, its tag and owner
  // are unchanged by a clone (the clone keeps the family), so replacing the object bought nothing
  // and cost one allocation per changed node per commit - and on an ordinary update that is the
  // whole clone-bubble from the changed leaf up to the root.
  committed.handle = handle;
  committed.rootTag = rootTag;
  committed.props = props;
  // The same flattened child list we diffed against, by reference (see the create path above for
  // why it is not copied). Anchors are retained-tree bookkeeping only; keeping raw node.children
  // here makes every anchored subtree look structurally changed on the next commit and can
  // re-append already-parented Fabric ShadowNode families under a cloned parent.
  committed.children = kids;
  committed.viewName = viewName;
  committed.parent = renderableParent;
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
  // Drop any setNativeProps writes still queued for this surface: their flush is a microtask away
  // and would otherwise commit into a container that no longer exists, re-creating it from scratch.
  pendingByRoot.delete(rootTag);
  if (rootContainers.delete(rootTag))
    dlog(`root container disposed root=${rootTag}`);
}

export function commitChildren(
  rootTag: IRootTag,
  children: readonly ISymbioteNode[],
): void {
  // The wrapper holds the surface's top-level children; reconcile walks from it so the
  // whole tree, synthetic root included, goes through the same clone-on-write path.
  const container = rootContainerFor(rootTag);
  container.children = children.slice();
  markStructureDirty(container);
  commitContainer(rootTag);
}

// Re-run the scoped commit for a surface from its synthetic root container, reusing
// whatever top-level children it currently holds. The shared half of the engine: both
// a full mutation->commit and a single-node Animated frame (setNativeProps) funnel here.
function commitContainer(rootTag: IRootTag): void {
  const slot = getSlot();
  batchCreate =
    globalThis.__SYMBIOTE_BATCH_CREATE__ === true &&
    slot.supportsCloneWithChildren;
  const container = rootContainerFor(rootTag);

  // The synthetic container is dirtied here, at the one entry point, because markDirty can never
  // bubble up to it: a surface's top-level nodes carry `parent === undefined` (surface.ts sets it
  // deliberately), so a mark stops at the top-level node and the container above it stays clean -
  // it would then early-exit and swallow the whole commit. Marking unconditionally costs one node's
  // props rebuild per commit and closes the hole for both callers, mutation commit and
  // setNativeProps alike.
  markDirty(container);

  // Before the walk, and before either early return: mutations for this tick are done, so a node
  // that `removeChild` unlinked is now either back under a parent (a framework spelling a move as
  // remove-then-reinsert) or gone for good. Costs one Set-size read until an app registers its
  // first host behavior. See host-behavior.ts for why removal cannot answer this itself.
  sweepDetachedBehaviors(container.children);

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
  //
  // TRAP FOR BEHAVIOR AUTHORS, and it cost two iterations to find: this return is ALSO the gate on
  // `runDeferredAttaches` and `runPostCommitHooks` below. A host behavior that calls
  // `requestCommitFor(node)` WITHOUT writing a prop therefore never reaches its `afterCommit` /
  // `attachAfterCommit` half — the commit it asked for is a no-op, and a no-op returns here.
  //
  // That is correct for what the hooks are FOR: they exist to retry once fresh Fabric tags are
  // assigned, and a commit that made zero native calls assigned none. So the fix is not to hoist
  // them above this line — that would run every deferred hook on every over-scheduled commit, which
  // is the common case. A behavior needing a turn of the loop with nothing to write should schedule
  // its own (`queueMicrotask`, as Switch's snap-back and Angular's `snapBackIfNeeded` both do) and
  // keep `afterCommit` registered for the case a microtask cannot reach: a prop change with no
  // preceding native event.
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

  // The same moment, for the half of a host behavior that could not run at `attach`. A behavior
  // whose setup needs a Fabric tag (a view command, a native Animated binding, an event attach)
  // declares `attachAfterCommit` and is drained here. `committedOf` is passed as the predicate
  // rather than imported by `host-behavior.ts`, keeping that dependency one-directional — this
  // module already imports from it, and a cycle is a live hazard under Metro's `inlineRequires`.
  runDeferredAttaches(node => committedOf(node) !== undefined);

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

// Re-commit a SET of nodes whose props changed and whose structure did not, by cloning those nodes
// and the union of the ancestor chains above them - never walking down from the root.
//
// This is the JS twin of what Fabric does natively for the same operation. RN's
// `UIManager::setNativeProps_DEPRECATED` (ReactCommon/react/renderer/uimanager/UIManager.cpp) does
// `shadowTree.commit(cloneTree(family, ...))`: clone the path to one family, reuse everything else.
// We cannot call that (it also makes the value STICKY on the ShadowNodeFamily, so a later
// declarative write of the same prop can never win again - which is why RN's own API is named
// `_DEPRECATED` and warns in dev). But the SHAPE is right, and it is the shape a general
// walk-from-the-root cannot express: the general path visits every sibling along the way just to
// hand back the handle their committed record already held.
//
// Measured on a 6-screen fixture (animated-commit-cost.test.ts): the chain is 5 nodes, the walk
// visits 15. The excess is the app's size, not the animation's, and it is what this removes.
//
// The UNION is what makes a batched frame worth batching, and the first attempt got it wrong by
// falling back to the general walk whenever more than one node was pending. Measured: five leaves
// animating on one screen cost 0.0275 ms that way against 0.0146 ms for five separate targeted
// commits - batching was 1.9x SLOWER, because one 17 504-node walk is dearer than five chain
// clones. Sharing the chain is the point: five rows of one list have four ancestors in common, and
// the union clones each of them ONCE (re-appending that 60-child list once instead of five times)
// while still emitting a single completeRoot.
//
// Returns false without touching anything when a precondition fails; the caller falls back to the
// general commit, which is always correct. It is all-or-nothing across the batch: one node that
// cannot prove its preconditions sends the whole set down the general path, which is correct for
// every one of them. Preconditions are deliberately strict:
//   - the node and every ancestor up to the container must already be committed (nothing to clone
//     from otherwise), and
//   - the change must be props-only. `viewNameFor` depends on `isText` (readonly) and on whether a
//     <Text> ancestor exists, so a props write cannot flip it; a STRUCTURAL change could, and takes
//     the general path.
//
// It deliberately does NOT clear the ancestors' `dirty` flags, only the changed node's. An ancestor
// may be dirty for a reason of its own - another pending change elsewhere in its subtree - and
// clearing it here would strand that change with no error. Leaving them set costs the next general
// commit a walk that finds nothing, which is exactly what the oracle test asserts.
interface ILeafWrite {
  node: ISymbioteNode;
  record: IMirror;
  props: IFabricProps;
  diff: IFabricProps;
}

// One node of the union that is NOT itself a write target: an ancestor that has to re-clone only
// because a persistent parent points at specific child handles.
interface IBranch {
  record: IMirror;
  /** Committed handles of this node's children, in order; changed slots are overwritten on clone. */
  handles: IFabricNode[];
  /** Where each changed child sits in `handles`. */
  slots: Map<ISymbioteNode, number>;
}

function commitTargeted(nodes: ReadonlySet<ISymbioteNode>): boolean {
  // ── PLAN FIRST, MUTATE SECOND ──────────────────────────────────────────────────────────────
  // Every precondition is checked and every sibling handle resolved before a single native call,
  // so a bail costs nothing and leaves the tree exactly as it was.
  //
  // This is not hypothetical tidiness: an earlier version validated the ancestor chain up front but
  // resolved SIBLING handles inside the clone loop, so a bail half-way had already re-pointed a
  // node's committed record at a clone that was never handed to completeRoot, and had already
  // cleared its dirty flags - so the general-path fallback then skipped the node as clean and
  // committed an orphan handle. The fallback test in animated-commit-cost.test.ts is what caught it.
  const writes: ILeafWrite[] = [];
  for (const node of nodes) {
    const record = committedOf(node);
    if (record === undefined) return false;
    // The node's own children must be the ones Fabric holds: this path never descends, so a
    // pending structural change below would be published as if it had not happened.
    if (node.structureDirty) return false;
    // THE TWIN OF THE CHECK ABOVE, and the one that was missing. `dirty` is a SUBTREE flag — it
    // means "this node or something under it needs work" — while this path clears it as if it were
    // a self flag. Clearing it over a dirty descendant strands that descendant permanently: the
    // general commit reconciles from the root, finds a clean chain, and never descends again.
    //
    // Direct children are enough, and that is not an approximation. `markDirty` walks up from the
    // dirtied node and STOPS at the first already-dirty ancestor; in this scenario that ancestor is
    // this node, so the chain from any dirty descendant up to here is fully marked — which makes a
    // dirty direct child a certainty whenever a dirty descendant exists. So the check is O(children)
    // rather than a subtree walk, on a path that runs once per animation frame.
    //
    // Reproduced 2026-08-24 by a peer's flag dump after tier-2 made a press ask for its own commit:
    // press the node, dirty its child in the same tick, and the child never commits again. Vue and
    // Solid did not show it because their schedulers rewrite the prop on the node itself and
    // re-dirty the chain — an accident of those schedulers, not a property of this contract.
    if (node.children.some(child => child.dirty)) {
      dlog('commit targeted: dirty descendant, using the general path');
      return false;
    }

    // Counted like the general path's rebuild, because it is one: the meter must not read as though
    // an animation frame builds no payload just because it took the short route.
    profile.propsBuilt += 1;
    const props = fabricProps(node);
    const diff = diffProps(record.props, props);
    if (Object.keys(diff).length === 0) {
      // Fabric already holds these values. Not an error and not a fallback: the general path would
      // reach the same conclusion, after walking the tree to get here. Dropping it from the batch
      // is safe even if a LATER node bails the whole thing — its props genuinely match Fabric, so
      // the general commit skipping it as clean publishes the same tree.
      node.dirty = false;
      node.propsDirty = false;
      dlog(`commit targeted tag=${record.tag} no-op (props identical)`);
      continue;
    }
    writes.push({ node, record, props, diff });
  }
  if (writes.length === 0) return true;

  // Build the union of the ancestor chains. `changed` is the whole union keyed by node, so a shared
  // ancestor is entered ONCE however many of the batch's leaves sit under it — which is the entire
  // saving over committing each leaf separately.
  const changed = new Map<ISymbioteNode, Set<ISymbioteNode>>();
  let unionRoot: ISymbioteNode | undefined;
  for (const write of writes) {
    let child: ISymbioteNode = write.node;
    let ancestor = write.record.parent;
    while (ancestor !== undefined) {
      const record = committedOf(ancestor);
      if (record === undefined) return false;
      // THE precondition, and the one an earlier version of this function missed. `record.children`
      // is a SNAPSHOT from the last commit. If this ancestor's real child list has moved on - a row
      // added, removed, or reordered - rebuilding its child set from that snapshot silently
      // publishes the OLD structure, with no error anywhere. Caught by the fallback row in
      // animated-commit-cost.test.ts, which appends a sibling and then animates: without this check
      // the new sibling never reached Fabric and every other assertion still passed.
      if (ancestor.structureDirty) {
        dlog(
          'commit targeted: ancestor child list moved on, using the general path',
        );
        return false;
      }
      const seen = changed.get(ancestor);
      if (seen !== undefined) {
        // Already in the union via another leaf. Everything ABOVE it is therefore already in too,
        // and already names this node as changed, so the walk stops here.
        seen.add(child);
        break;
      }
      changed.set(ancestor, new Set([child]));
      if (record.parent === undefined) unionRoot = ancestor;
      child = ancestor;
      ancestor = record.parent;
    }
  }
  // Resolve every branch's child handles now, so the clone pass below cannot fail part-way.
  const branches = new Map<ISymbioteNode, IBranch>();
  for (const [node, changedChildren] of changed) {
    const record = committedOf(node);
    if (record === undefined) return false;
    const handles: IFabricNode[] = [];
    const slots = new Map<ISymbioteNode, number>();
    for (const child of record.children) {
      const childRecord = committedOf(child);
      // A sibling with no committed record means a structural change is pending, which this path
      // cannot express. Bail before touching anything.
      if (childRecord === undefined) {
        dlog('commit targeted: uncommitted sibling, using the general path');
        return false;
      }
      if (changedChildren.has(child)) slots.set(child, handles.length);
      handles.push(childRecord.handle);
    }
    if (slots.size !== changedChildren.size) {
      // A changed child is not in its parent's committed child list — an uncommitted move.
      dlog(
        'commit targeted: child not in committed set, using the general path',
      );
      return false;
    }
    branches.set(node, { record, handles, slots });
  }
  // Every write is on one surface (the caller batches by rootTag), so the chains converge on that
  // surface's synthetic container and nowhere else. Checked HERE, the last statement of the plan,
  // so the clone pass below has no way left to bail after it has started mutating.
  const rootBranch =
    unionRoot === undefined ? undefined : branches.get(unionRoot);
  if (unionRoot === undefined || rootBranch === undefined) return false;
  const rootTag = rootBranch.record.rootTag;

  // ── MUTATE ─────────────────────────────────────────────────────────────────────────────────
  const slot = getSlot();
  const walkStart = performance.now();
  const cloned = new Map<ISymbioteNode, IFabricNode>();

  for (const write of writes) {
    guardSerializable(write.diff, write.record.viewName, write.record.tag);
    const handle = slot.cloneNodeWithNewProps(write.record.handle, write.diff);
    stats.cloneProps += 1;
    write.record.handle = handle;
    write.record.props = write.props;
    write.node.dirty = false;
    write.node.propsDirty = false;
    cloned.set(write.node, handle);
  }

  // Re-clone each branch exactly once, deepest first. The recursion is bounded by the tree depth,
  // and every branch it touches is in the plan above, so nothing here can bail.
  const cloneBranch = (node: ISymbioteNode): IFabricNode | undefined => {
    const done = cloned.get(node);
    if (done !== undefined) return done;
    const branch = branches.get(node);
    // Unreachable by construction: cloneBranch is only ever called on a node the plan put in
    // `branches` or the write loop put in `cloned`. Leaving the committed handle in place is the
    // safe direction if that ever stops being true, and the oracle row would report it.
    if (branch === undefined) return undefined;
    for (const [child, index] of branch.slots) {
      const childHandle = cloneBranch(child);
      if (childHandle !== undefined) branch.handles[index] = childHandle;
    }
    const batched = slot.supportsCloneWithChildren;
    const handle = slot.cloneNodeWithNewChildren(
      branch.record.handle,
      batched ? branch.handles : undefined,
    );
    stats.cloneChildren += 1;
    if (!batched)
      for (const childHandle of branch.handles)
        slot.appendChild(handle, childHandle);
    branch.record.handle = handle;
    cloned.set(node, handle);
    return handle;
  };
  const rootHandle = cloneBranch(unionRoot) ?? rootBranch.record.handle;

  const childSet = slot.createChildSet(rootTag);
  slot.appendChildToSet(childSet, rootHandle);
  slot.completeRoot(rootTag, childSet);
  profile.walkMs += performance.now() - walkStart;
  profile.commits += 1;
  profile.nodesVisited += cloned.size;
  runPostCommitHooks();
  dlog(
    `commit targeted root=${rootTag} leaves=${writes.length} ` +
      `union=${branches.size}`,
  );
  return true;
}

// A JS-driven Animated frame lands in setNativeProps once per animated leaf. Five animations on
// five rows of one list therefore used to mean FIVE commits per frame: five completeRoots, and
// every shared ancestor re-cloned - with its whole child list re-appended - five times over. The
// dirty-set census (`symbiote-perf-measurement` skill) measured that appendChild is the real floor
// of a commit and that it multiplies almost exactly with the commit count. So the win here is not a
// faster commit, it is FEWER of them.
//
// The batch never drops a value, and that is a rule, not a hope. Merging writes to DIFFERENT nodes
// is free - each carries its own value and one commit publishes them all. The single case where
// merging WOULD lose a value is a second write to a node already pending, so that case does not
// merge: it publishes the pending batch first, synchronously, and opens a new one. Hence:
//
//   N writes to N different nodes in one task  ->  one completeRoot, all N values land
//   two writes to the SAME node in one task    ->  two completeRoots, both values land
//
// The second row costs nothing in practice: an Animated.Value ticks its props node exactly once per
// rAF (animations/timing.ts's onFrame calls onUpdate once, then schedules the next frame), so
// concurrent animations are always distinct nodes. It exists for the paths that genuinely can write
// twice - two animations bound to one prop of one node, or Animated.event when the host delivers
// two scroll events in a single task.
const pendingByRoot = new Map<IRootTag, Set<ISymbioteNode>>();
let flushScheduled = false;

// Publish every pending write: one commit per surface. A surface with exactly one pending node
// takes the targeted chain clone (4.5x, §4a); with several it takes the general walk, which already
// visits only dirty paths and reaches all of them under a single completeRoot - which is the point.
export function flushNativeProps(): void {
  flushScheduled = false;
  if (pendingByRoot.size === 0) return;
  const batches = [...pendingByRoot];
  pendingByRoot.clear();
  for (const [rootTag, nodes] of batches) {
    if (commitTargeted(nodes)) continue;
    dlog(`flush native props root=${rootTag} nodes=${nodes.size} (general)`);
    commitContainer(rootTag);
  }
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
  // BEFORE the prop writes below, deliberately: the pending batch still has to publish the value
  // this node holds right now, and mutating first would overwrite the very thing being preserved.
  if (pendingByRoot.get(record.rootTag)?.has(node) === true) {
    dlog(
      `setNativeProps tag=${record.tag} written twice in one task, flushing`,
    );
    flushNativeProps();
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
      // Writes `node.props` directly, so it owes the aria gate for the same reason it owes the
      // props mark below: `setProp` is where that flag is normally raised and this path bypasses
      // it. An `aria-*` arriving only through setNativeProps would otherwise never be folded.
      if (!node.hasAriaAlias && isAriaAliasKey(key)) node.hasAriaAlias = true;
    }
  }
  // Writes node.props directly rather than through setProp, so it owes its own mark - and it owes
  // the PROPS mark specifically: markDirty alone would send the node down the fast lane above,
  // which reuses the mirror's payload by reference and would drop the Animated frame entirely.
  markPropsDirty(node);
  dlog(
    `setNativeProps root=${record.rootTag} tag=${record.tag} keys=${Object.keys(partial)}`,
  );
  // Queued, not committed: every write made in this task publishes together at the microtask
  // boundary. See the batching note above commitTargeted's caller block for why that loses nothing.
  requestCommitFor(node);
}

/**
 * Publish a node whose props were changed OUTSIDE any renderer mutation.
 *
 * Dirtying is not publishing. Every other write reaches Fabric because the framework's own commit
 * follows it; a change driven by a NATIVE EVENT has no such follow-up — `native-events.ts`
 * requests no commit and no adapter does either, so a node marked dirty from an event handler
 * simply stays dirty. The host-behavior press path (`setNodePressed` for `:active`) is the first
 * caller that is not `setNativeProps`, and `setNodeHidden`'s React twin never needed it because
 * the reconciler is already in its commit phase when it calls.
 *
 * Queued rather than committed on the spot, sharing `setNativeProps`' batch: several writes in one
 * task publish together at the microtask boundary, one commit per surface.
 */
export function requestCommitFor(node: ISymbioteNode): void {
  const record = committedOf(node);
  if (record === undefined) {
    dlog('requestCommitFor skipped: node not committed');
    return;
  }
  let pending = pendingByRoot.get(record.rootTag);
  if (pending === undefined) {
    pending = new Set();
    pendingByRoot.set(record.rootTag, pending);
  }
  pending.add(node);
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flushNativeProps);
  }
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
