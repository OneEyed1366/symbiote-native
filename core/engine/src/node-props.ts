// The prop write path: the one choke point every writer passes on its way to an op, plus the
// function-prop stash and the two counters `readCommitProfile` drains

import {
  isPendingCreate,
  noteHostSideChange,
  recordSetProp,
  recordSetText,
} from './mutation-buffer';
import {
  derivedNodesOf,
  noteCommitHookNodeChanged,
  slotDerivesFrom,
} from './host-behavior';
import { resolveStructuredStyle } from './structured-style';
import {
  IMAGE_SOURCE_PROPS,
  resolveImageSourceProp,
} from './image-source-write';
import { Platform } from './platform';
import { isDebug } from './debug';
import { flushOps, treeHost } from './tree-host';
import type { ISymbioteNode } from './node-types';

// How many prop writes an adapter pushed at the engine, read and zeroed through
// `readCommitProfile`. Not gated behind `isDebug()`, т.к. an integer increment is noise next to the
// prop write it counts
const propStats = { writes: 0 };

export function takePropStats(): { writes: number } {
  const snapshot = { writes: propStats.writes };
  propStats.writes = 0;
  return snapshot;
}

// `<component>.<key>` to write count, gated behind `isDebug()` т.к. a `Map` lookup per write is
// real cost on the hottest path. Names which (view, key) pair an aggregate delta is hiding
let propKeyTally: Map<string, number> | undefined;

export function takePropKeyTally(): ReadonlyMap<string, number> {
  const snapshot = propKeyTally ?? new Map();
  propKeyTally = undefined;
  return snapshot;
}

// React's JSX dev transform annotates every element with `__self` and `__source`, which React's own
// host config consumes and never forwards. Both platforms reject them: `__self` is a cyclic module
// `this`, and `jsi::dynamicFromValue` keeps no visited set
export const REACT_JSX_DEV_PROPS: ReadonlySet<string> = new Set([
  '__self',
  '__source',
]);

// Function props that never left JS, keyed by node. A function CANNOT cross this wire, т.к.
// `jsi::dynamicFromValue` THROWS on a callable and kills the whole batch
const functionProps = new WeakMap<ISymbioteNode, Map<string, unknown>>();

// A pure prop set with no event inference: the event-vs-prop decision is `routeProp`'s, never the
// key's name. `undefined` DELETES the key, where `null` is a legitimate Fabric "reset to default"

// No `Object.is` dedupe here, т.к. it needs the value the node already holds, which JS does not.
// The guard lives in the host's `OP_SET_PROP`, where the previous value is a local field
export function setProp(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): void {
  // A composed primitive's slot, and its wrapper where it has one, can carry a value DERIVED from
  // an owner prop, so `markPropsDirty` bubbles up or neither ever learns
  if (node.childHost !== undefined && slotDerivesFrom(node, key)) {
    markPropsDirty(node.childHost);
    // Past the slot: a `buildStructure` that builds a CHAIN registers the deeper nodes here, and
    // each keeps its own pure fold reading the owner. See `addDerivedNode`
    const derived = derivedNodesOf(node);
    if (derived !== undefined) for (const each of derived) markPropsDirty(each);
    if (node.wrapper !== undefined) markPropsDirty(node.wrapper);
  }
  propStats.writes += 1;
  if (isDebug()) {
    propKeyTally ??= new Map();
    const tallyKey = `${node.component}.${key}`;
    propKeyTally.set(tallyKey, (propKeyTally.get(tallyKey) ?? 0) + 1);
  }
  writeProp(node, key, value);
}

// The one place a prop reaches the wire, and the only place that can keep a function off it.
// `setNativeProps` calls this rather than `recordSetProp`, т.к. it has no `routeProp` in front
export function writeProp(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): void {
  // Repeated from `routeProp` т.к. THIS is the path with nothing in front of it: `AnimatedProps`
  // re-sends its whole raw bag every frame, so on a JSX adapter `__self` rides straight past
  if (REACT_JSX_DEV_PROPS.has(key)) return;

  // Arms the node's recurring post-commit hook. HERE т.к. this is where the declarative and
  // `setNativeProps` paths meet, and a hook armed only by the former misses the imperative write
  if (node.hasCommitHook) noteCommitHookNodeChanged(node);

  // `boxShadow` / `filter` / `transform` and Image's source props resolve on the way IN, at this
  // same choke point, т.к. the C++ payload builder has no JS to do it headless
  let written: unknown = value;
  if (key === 'style' || key === 'activeStyle') {
    written = resolveStructuredStyle(value);
  } else if (node.resolvesImageSources && IMAGE_SOURCE_PROPS.has(key)) {
    written = resolveImageSourceProp(
      value,
      key === 'source' && Platform.OS === 'android',
    );
  }
  if (typeof written === 'function') {
    let bag = functionProps.get(node);
    if (bag === undefined) {
      bag = new Map();
      functionProps.set(node, bag);
    }
    bag.set(key, value);
    // The host must not be left holding whatever stood under this key before: a stale value read
    // back through `propOf` would beat the function this write just stashed
    recordSetProp(node, key, undefined);
    return;
  }
  // Written over with a non-function, so the stash must let go or it keeps answering
  const bag = functionProps.get(node);
  if (bag !== undefined) bag.delete(key);
  recordSetProp(node, key, written);
}

/** What `propOf` consults before asking the host, `undefined` when nothing was stashed. */
export function functionPropOf(node: ISymbioteNode, key: string): unknown {
  return functionProps.get(node)?.get(key);
}

// The same stash, whole, for `propsOf` to layer over the host's answer. `undefined` rather than an
// empty `Map` for a node that stashed nothing, so the caller hands back the host's own object
export function functionPropsOf(
  node: ISymbioteNode,
): ReadonlyMap<string, unknown> | undefined {
  return functionProps.get(node);
}

// "Rebuild this node's payload, the fold reads state I just changed". A behavior whose payload is
// DERIVED has no prop to write, so this is the one route that dirties it directly
export function markPropsDirty(node: ISymbioteNode): void {
  // Announced to the buffer even though it writes no op, т.к. a commit that cannot see this change
  // would skip itself as idle
  noteHostSideChange();
  if (node.hasCommitHook) noteCommitHookNodeChanged(node);
  // A node this batch created has no committed payload and the host cannot name it yet, so the mark
  // is a no-op and the `flushOps` it would force is the whole of its cost
  if (isPendingCreate(node)) return;
  // The host call takes a HANDLE, so it has to be ORDERED after the ops that built the node
  flushOps();
  treeHost()?.markPropsDirty(node);
}

// Counted in `propStats`, т.к. a text write IS a prop write, reaching Fabric as `RCTRawText`'s only
// prop. Unguarded for the same reason `setProp` is: the host holds the standing text and dedupes
export function setText(node: ISymbioteNode, text: string): void {
  propStats.writes += 1;
  recordSetText(node, text);
}
