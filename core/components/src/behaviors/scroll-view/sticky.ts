// Sticky headers on the lowered path: the CHILD form of `stickyHeaderIndices`, plus the owner-side
// half that feeds it.
//
// WHY A CHILD AND NOT THE PROP. `stickyHeaderIndices` is an index list because JSX has no way to
// MARK an element — RN walks its own children array and wraps the flagged ones. A lowered element
// has no children array to walk and no render to wrap anything in, so the index cannot be resolved
// at all. `<StickyHeader>` says the same thing in the one place a lowered element can read it: the
// tag of a node that is already in the tree.
//
// WHAT RUNS WHERE. The DECISIONS are `reduceSticky` (`../../state/sticky-header-reducer`), shared
// with every adapter's own sticky component and untouched here. This module is one more EFFECT
// RUNNER for it — the fourth, after React/Vue/Svelte's components and Angular's projection
// controller — and the only one that runs on an engine node with no framework above it. The
// runner's shape is Angular's (`adapters/angular/src/components/scroll-view/projection.ts`),
// because that one already drives engine nodes; what changes is where the cross-talk comes from.
//
// CROSS-TALK WITHOUT INDICES. Each header is fed the y of the NEXT sticky header, which is the
// collision point it gets pushed off at. Every existing runner reads that out of an index map
// (`nextStickyHeaderY(childIndex)`), because indices are what it has. Here the owner keeps its
// headers in DOCUMENT order and the next one is the next entry — no index, and nothing to renumber
// when a list windows.
//
// THE OWNER HALF, and it is why this file holds both. Three of the scroll view's own props are
// functions of "does this ScrollView have sticky headers", which only a registration can answer:
// `scrollEventThrottle` (RN raises it so the offset reaches the AnimatedValue at all), the scroll
// listener that drives that value, and — inverted only — the viewport height the pin math needs.
// A separate module would have to export a registry back and forth.

import {
  AnimatedProps,
  AnimatedValue,
  appListenerFor,
  dlog,
  markPropsDirty,
  Platform,
  requestCommitFor,
  setBehaviorListener,
  setProp,
  whenCommitted,
  type AnimatedInterpolation,
  type IHostBehavior,
  type IPayloadFold,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  createInitialStickyState,
  reduceSticky,
  type IStickyAction,
  type IStickyEffect,
  type IStickyHeaderState,
} from '../../state/sticky-header-reducer';
import {
  readLayoutNumber,
  STICKY_HEADER_Z_INDEX,
} from '../../view/render-scroll-sticky';
import { resolveScrollForwarding } from '../../view/render-scroll-view';

export const STICKY_HEADER_TAG = 'symbiote-sticky-header';

// The scroll views that could own a header, so a header can find its own by walking up. The tag is
// not on the node (`createElement` looks the behavior up and stores nothing), and the parent chain
// is the only route — a header may sit any depth below the content view.
const scrollOwners = new WeakSet<ISymbioteNode>();

interface IStickyOwnerState {
  // Shared by every header of this ScrollView: one value tracks the offset, each header
  // interpolates it into its own pin. Allocated with the first header, never before — a ScrollView
  // with no sticky child pays nothing.
  scrollValue: AnimatedValue;
  members: Set<ISymbioteNode>;
  // Document order, rebuilt lazily from the content subtree. `undefined` = owed a walk.
  ordered: ISymbioteNode[] | undefined;
  layoutYs: Map<ISymbioteNode, number>;
  viewportHeight: number | undefined;
  // The throttle THIS module wrote, so it can take back exactly its own value and never an app's.
  writtenThrottle: number | undefined;
}

const stickyOwners = new WeakMap<ISymbioteNode, IStickyOwnerState>();

interface IStickyHeaderRuntime {
  state: IStickyHeaderState;
  owner: ISymbioteNode | undefined;
  interpolation: AnimatedInterpolation | undefined;
  listenerId: string | undefined;
  debounceTimer: ReturnType<typeof setTimeout> | undefined;
  leaf: AnimatedProps | undefined;
  cancelBind: (() => void) | undefined;
}

const headerRuntimes = new WeakMap<ISymbioteNode, IStickyHeaderRuntime>();

// ---------------------------------------------------------------- the owner half

export function markScrollOwner(node: ISymbioteNode): void {
  scrollOwners.add(node);
}

export function hasStickyHeaders(owner: ISymbioteNode): boolean {
  const sticky = stickyOwners.get(owner);
  return sticky !== undefined && sticky.members.size > 0;
}

// Only the INVERTED pin reads the viewport height (`computeStickyInterpolation` ignores it
// otherwise), which is exactly when RN wraps the scroll view's own onLayout — so the gate flag
// lands on the same ScrollViews the wrapper puts it on and on no others.
function needsViewportHeight(owner: ISymbioteNode): boolean {
  return hasStickyHeaders(owner) && owner.props.invertStickyHeaders === true;
}

function ownerSticky(owner: ISymbioteNode): IStickyOwnerState {
  const existing = stickyOwners.get(owner);
  if (existing !== undefined) return existing;
  const created: IStickyOwnerState = {
    scrollValue: new AnimatedValue(0),
    members: new Set(),
    ordered: undefined,
    layoutYs: new Map(),
    viewportHeight: undefined,
    writtenThrottle: undefined,
  };
  stickyOwners.set(owner, created);
  return created;
}

// Depth-first over the content subtree, which IS document order — the same order RN's children
// walk produces, arrived at from the tree instead of from an index array.
function collectHeaders(
  node: ISymbioteNode,
  members: ReadonlySet<ISymbioteNode>,
  out: ISymbioteNode[],
): void {
  for (const child of node.children) {
    if (members.has(child)) out.push(child);
    collectHeaders(child, members, out);
  }
}

function orderedHeaders(
  owner: ISymbioteNode,
  sticky: IStickyOwnerState,
): readonly ISymbioteNode[] {
  if (sticky.ordered !== undefined) return sticky.ordered;
  const out: ISymbioteNode[] = [];
  collectHeaders(owner.childHost ?? owner, sticky.members, out);
  sticky.ordered = out;
  return out;
}

// RN raises the scroll event rate for sticky headers so the offset actually reaches the
// AnimatedValue (`ScrollView.js:1798`). An app value always wins, which is why this reads
// `resolveScrollForwarding` rather than the constant — the 1/16 split lives there.
//
// `nativeStickyAvailable: false` is deliberate and is NOT a missing capability: the first tick has
// to reach each header's interpolation through JS, because `__makeNative()` cascades to the PARENT
// first, so a scroll value made native up front permanently disables the child listener cascade
// before a single tick arrives. Every adapter's ScrollView forces the same false for the same
// reason; the pin promotes itself to native off the first settled debounce.
function syncThrottle(owner: ISymbioteNode, sticky: IStickyOwnerState): void {
  const current = owner.props.scrollEventThrottle;
  // Whatever stands in the key is the APP's unless it is byte-for-byte the value written here —
  // which is what makes the take-back on the last unregister safe.
  const ours =
    sticky.writtenThrottle !== undefined && current === sticky.writtenThrottle;
  const appThrottle =
    !ours && typeof current === 'number' ? current : undefined;
  const wanted = resolveScrollForwarding({
    hasStickyHeaders: sticky.members.size > 0,
    nativeStickyAvailable: false,
    invertStickyHeaders: undefined,
    scrollEventThrottle: appThrottle,
    maintainVisibleContentPosition: undefined,
    snapToAlignment: undefined,
  }).scrollEventThrottle;
  if (wanted === current) return;
  // `wanted` IS `appThrottle` whenever the app set one, so nothing is claimed in that case.
  sticky.writtenThrottle = appThrottle === undefined ? wanted : undefined;
  setProp(owner, 'scrollEventThrottle', wanted);
  requestCommitFor(owner);
}

// The owner's own layout, wanted by an inverted sticky pin and by the app, and installed while
// EITHER wants it. Both halves route through here so neither can uninstall the other's.
export function syncOwnerLayout(owner: ISymbioteNode): void {
  const wanted =
    needsViewportHeight(owner) || appListenerFor(owner, 'layout') !== undefined;
  setBehaviorListener(
    owner,
    'layout',
    wanted ? event => handleOwnerLayout(owner, event) : undefined,
  );
}

function handleOwnerLayout(owner: ISymbioteNode, event: ISymbioteEvent): void {
  const sticky = stickyOwners.get(owner);
  const height = readLayoutNumber(event, 'height');
  if (sticky !== undefined && height !== undefined) {
    sticky.viewportHeight = height;
    for (const header of sticky.members)
      dispatch(header, { kind: 'inputs-changed' });
  }
  const app = appListenerFor(owner, 'layout');
  if (typeof app === 'function') app(event);
}

function readContentOffsetY(event: ISymbioteEvent): number | undefined {
  const native = event.nativeEvent;
  if (typeof native !== 'object' || native === null) return undefined;
  const offset = Reflect.get(native, 'contentOffset');
  if (typeof offset !== 'object' || offset === null) return undefined;
  const y = Reflect.get(offset, 'y');
  return typeof y === 'number' ? y : undefined;
}

// The owner's scroll dispatcher: drive the shared value, then hand the app its event. Installed
// unconditionally, exactly as RN installs `_handleScroll` unconditionally (`ScrollView.js:1145`) —
// the app's own `onScroll` is an OWNED name and would otherwise evict this one from the single
// listener slot.
export function handleOwnerScroll(
  owner: ISymbioteNode,
  event: ISymbioteEvent,
): void {
  const sticky = stickyOwners.get(owner);
  if (sticky !== undefined && sticky.members.size > 0) {
    const y = readContentOffsetY(event);
    if (y !== undefined) sticky.scrollValue.setValue(y);
  }
  const app = appListenerFor(owner, 'scroll');
  if (typeof app === 'function') app(event);
}

// The ScrollView's own teardown. Every header's runtime is released by its own `detach`, so the
// only thing owed here is the owner state — and cutting each header's back-reference with it, so a
// header still in flight cannot dispatch into a registry that is gone.
export function releaseStickyOwner(owner: ISymbioteNode): void {
  const sticky = stickyOwners.get(owner);
  if (sticky === undefined) return;
  for (const header of sticky.members) {
    const runtime = headerRuntimes.get(header);
    if (runtime !== undefined) runtime.owner = undefined;
  }
  stickyOwners.delete(owner);
}

// ---------------------------------------------------------------- the header half

function findScrollOwner(node: ISymbioteNode): ISymbioteNode | undefined {
  let current = node.parent;
  while (current !== undefined) {
    if (scrollOwners.has(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function nextHeaderY(
  runtime: IStickyHeaderRuntime,
  node: ISymbioteNode,
): number | undefined {
  const owner = runtime.owner;
  if (owner === undefined) return undefined;
  const sticky = stickyOwners.get(owner);
  if (sticky === undefined) return undefined;
  const order = orderedHeaders(owner, sticky);
  const next = order[order.indexOf(node) + 1];
  return next === undefined ? undefined : sticky.layoutYs.get(next);
}

// The committed half of the pin: the debounced translateY RN pushes into the transform for
// hit-testing (`passthroughAnimatedPropExplicitValues`), plus the two constants the wrapper always
// carries. The SMOOTH half rides the AnimatedProps leaf below and never passes through here.
//
// A per-node fold, assigned in `attach`, because what it reads is per-node runtime state rather
// than a prop — the behavior-level `foldPayload` gets props and nothing else.
function stickyFold(runtime: IStickyHeaderRuntime): IPayloadFold {
  return props => {
    const pin: Record<string, unknown> = { zIndex: STICKY_HEADER_Z_INDEX };
    if (runtime.state.translateY !== null)
      pin.transform = [{ translateY: runtime.state.translateY }];
    return {
      ...props,
      // Over the app's, never under: the pin is the whole point of the element, and a header whose
      // own style set a transform would otherwise cancel it.
      style: [props.style, pin],
      // Yoga may flatten a view that only groups children, and a flattened header has no transform
      // to animate. RN's sticky wrapper sets it for the same reason.
      collapsable: false,
    };
  };
}

function dispatch(node: ISymbioteNode, action: IStickyAction): void {
  const runtime = headerRuntimes.get(node);
  if (runtime === undefined || runtime.owner === undefined) return;
  const sticky = stickyOwners.get(runtime.owner);
  const result = reduceSticky(runtime.state, action, {
    os: Platform.OS,
    inverted: runtime.owner.props.invertStickyHeaders === true,
    scrollViewHeight: sticky?.viewportHeight,
    nextHeaderLayoutY: nextHeaderY(runtime, node),
  });
  runEffects(node, runtime, result.effects);
}

function runEffects(
  node: ISymbioteNode,
  runtime: IStickyHeaderRuntime,
  effects: readonly IStickyEffect[],
): void {
  for (const effect of effects) {
    switch (effect.kind) {
      case 'rebuild-interpolation':
        rebuildInterpolation(
          node,
          runtime,
          effect.inputRange,
          effect.outputRange,
        );
        break;
      case 'schedule-debounce':
        if (runtime.debounceTimer !== undefined)
          clearTimeout(runtime.debounceTimer);
        runtime.debounceTimer = setTimeout(() => {
          runtime.debounceTimer = undefined;
          dispatch(node, { kind: 'debounce-fired', value: effect.value });
        }, effect.delay);
        break;
      case 'apply-passthrough':
        // The fold reads `runtime.state`, which no prop write touched, so nothing has marked the
        // node — and dirtying is not publishing, hence both calls.
        //
        // NOT witnessed by a headless test, and the reason is worth knowing before deleting it:
        // while the pin is JS-driven the animated leaf's own `setNativeProps` has already written
        // the same transform and marked the node, so removing this line reddens nothing here. It
        // is the NATIVE-driver path this exists for — there the leaf stops writing JS-side and the
        // committed transform is all hit-testing has, which is exactly why RN keeps
        // `passthroughAnimatedPropExplicitValues` beside the animated one.
        markPropsDirty(node);
        requestCommitFor(node);
        break;
      case 'record-header-y':
        // Recorded from the layout handler instead: the reducer emits this only for a runner that
        // owns a child INDEX, and the owner's document order is what replaces indices here.
        break;
    }
  }
}

function rebuildInterpolation(
  node: ISymbioteNode,
  runtime: IStickyHeaderRuntime,
  inputRange: readonly number[],
  outputRange: readonly number[],
): void {
  const owner = runtime.owner;
  if (owner === undefined) return;
  const sticky = stickyOwners.get(owner);
  if (sticky === undefined) return;
  if (runtime.interpolation !== undefined && runtime.listenerId !== undefined)
    runtime.interpolation.removeListener(runtime.listenerId);
  const next = sticky.scrollValue.interpolate({
    inputRange: [...inputRange],
    outputRange: [...outputRange],
  });
  runtime.listenerId = next.addListener(({ value }) => {
    if (typeof value === 'number')
      dispatch(node, { kind: 'animated-tick', value });
  });
  runtime.interpolation = next;

  // A fresh leaf per rebuild, as every other runner does: `AnimatedProps` binds the props map it
  // was constructed with, so a new interpolation node needs a new leaf. No `__makeNative()` — the
  // leaf joins the graph under the scroll value and promotes when that value does.
  const leaf = new AnimatedProps({
    style: { transform: [{ translateY: next }], zIndex: STICKY_HEADER_Z_INDEX },
  });
  leaf.__attach();
  runtime.leaf?.__detach();
  runtime.leaf = leaf;
  runtime.cancelBind?.();
  runtime.cancelBind = whenCommitted(node, () => leaf.setNativeView(node));
}

function handleHeaderLayout(node: ISymbioteNode, event: ISymbioteEvent): void {
  const runtime = headerRuntimes.get(node);
  if (runtime === undefined) return;
  const y = readLayoutNumber(event, 'y');
  const height = readLayoutNumber(event, 'height');
  if (runtime.owner !== undefined && y !== undefined) {
    const sticky = stickyOwners.get(runtime.owner);
    if (sticky !== undefined && sticky.layoutYs.get(node) !== y) {
      sticky.layoutYs.set(node, y);
      // The cross-talk: this header's y is the PREVIOUS one's collision point, and nothing else
      // tells that header its input moved.
      const order = orderedHeaders(runtime.owner, sticky);
      const previous = order[order.indexOf(node) - 1];
      if (previous !== undefined)
        dispatch(previous, { kind: 'inputs-changed' });
    }
  }
  // Keep the previous value when a field is absent, as every runner does — RN sets state only on a
  // defined read.
  dispatch(node, {
    kind: 'layout',
    y: y ?? runtime.state.layoutY,
    height: height ?? runtime.state.layoutHeight,
  });
  const app = appListenerFor(node, 'layout');
  if (typeof app === 'function') app(event);
}

function attach(node: ISymbioteNode): void {
  const runtime: IStickyHeaderRuntime = {
    state: createInitialStickyState(),
    owner: undefined,
    interpolation: undefined,
    listenerId: undefined,
    debounceTimer: undefined,
    leaf: undefined,
    cancelBind: undefined,
  };
  headerRuntimes.set(node, runtime);
  node.payloadFold = stickyFold(runtime);
  setBehaviorListener(node, 'layout', event => handleHeaderLayout(node, event));
}

// The registration waits for a committed tag rather than happening in `attach`, and both halves of
// that are load-bearing: at `attach` the node has no parent, so there is no owner to find, and the
// AnimatedProps leaf needs a tag to bind to.
function attachAfterCommit(node: ISymbioteNode): void {
  const runtime = headerRuntimes.get(node);
  if (runtime === undefined || runtime.owner !== undefined) return;
  const owner = findScrollOwner(node);
  if (owner === undefined) {
    dlog('sticky header committed outside a ScrollView — the pin is a no-op');
    return;
  }
  runtime.owner = owner;
  const sticky = ownerSticky(owner);
  sticky.members.add(node);
  sticky.ordered = undefined;
  syncThrottle(owner, sticky);
  syncOwnerLayout(owner);
  dlog(`sticky header registered (${sticky.members.size} on this ScrollView)`);
  dispatch(node, { kind: 'inputs-changed' });
}

function detach(node: ISymbioteNode): void {
  const runtime = headerRuntimes.get(node);
  if (runtime === undefined) return;
  runtime.cancelBind?.();
  if (runtime.interpolation !== undefined && runtime.listenerId !== undefined)
    runtime.interpolation.removeListener(runtime.listenerId);
  if (runtime.debounceTimer !== undefined) clearTimeout(runtime.debounceTimer);
  runtime.leaf?.__detach();
  const owner = runtime.owner;
  headerRuntimes.delete(node);
  if (owner === undefined) return;
  const sticky = stickyOwners.get(owner);
  if (sticky === undefined) return;
  sticky.members.delete(node);
  sticky.layoutYs.delete(node);
  sticky.ordered = undefined;
  syncThrottle(owner, sticky);
  syncOwnerLayout(owner);
}

export const stickyHeaderBehavior: IHostBehavior = {
  // The app's own `onLayout` on a sticky header is forwarded, not replaced: the header's measured
  // y is what the whole machine runs on, so the behavior cannot give the slot up.
  ownedListeners: ['layout'],
  attach,
  attachAfterCommit,
  detach,
};
