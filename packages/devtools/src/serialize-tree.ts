// Pure tree serialization: ISymbioteNode (core/engine/src/node.ts) -> ISerializedNode
// (./protocol.ts), a plain JSON-safe, size-bounded shape sent to the DevTools panel on every
// commit while a panel is subscribed. Framework-agnostic on purpose — it reads only the
// engine's own retained tree, never anything adapter-specific (React/Vue/Angular/Svelte all
// dissolve into the same RCTView/RCTText/RCTRawText primitives by the time a node reaches here).
import { isAnchor, type ISymbioteNode } from '@symbiote-native/engine';
import type { ISerializedNode } from './protocol';

const RAW_TEXT_COMPONENT = 'RCTRawText';

const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_DEPTH = 5;
const MAX_STRING_LENGTH = 500;
const TEXT_PREVIEW_LENGTH = 80;
const TRUNCATION_MARKER = '…';

// Hard caps on the WHOLE serialized tree — a deeply-nested-navigator screen can retain tens of
// thousands of native nodes (React Navigation wraps every screen in many layers and, by default,
// keeps every pushed/tabbed screen mounted simultaneously). Serializing and JSON-shipping ALL of
// them over the CDP bridge on every single commit crashed the DevTools panel on a real device
// (confirmed: browser tab hung, memory exhaustion, not a stack-depth issue — that was a separate,
// already-fixed bug in the PANEL's own client-side algorithms). These bound the payload itself, at
// the source, rather than trying to process an unbounded payload more cleverly downstream.
// MAX_SERIALIZED_NODES is shared across ALL active surfaces in one `serializeSurfaceTree` call —
// total payload size is what matters, not any one surface's share of it. Truncation is never
// silent: a node whose children got cut short carries `truncatedChildCount` (protocol.ts) so the
// panel can show it, rather than silently rendering an incomplete tree with no indication anything
// was cut.
// Exported so tests can assert against the real constants rather than duplicating magic numbers.
export const MAX_SERIALIZED_NODES = 2000;
export const MAX_TREE_DEPTH = 400;

// Stable per-node id across commits: engine nodes are mutated in place, not recreated, on a
// re-render (only a real unmount/remount replaces the object), so a WeakMap keyed by node
// identity gives the panel a key to diff/select against across snapshots without the engine
// needing to hand out ids of its own.
const nodeIds = new WeakMap<ISymbioteNode, number>();
let nextNodeId = 1;

function getStableNodeId(node: ISymbioteNode): number {
  const existing = nodeIds.get(node);
  if (existing !== undefined) return existing;
  const id = nextNodeId++;
  nodeIds.set(node, id);
  return id;
}

function truncateString(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}${TRUNCATION_MARKER}`
    : value;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Bounded, JSON-safe copy of an arbitrary prop value: primitives pass through (strings
// truncated); functions/symbols/class-instance-like values become a placeholder string;
// arrays cap at MAX_ARRAY_LENGTH; object nesting caps at MAX_OBJECT_DEPTH.
function serializeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string')
    return truncateString(value, MAX_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'symbol') return '[Symbol]';
  if (typeof value === 'bigint') return `${value.toString()}n`;

  if (depth >= MAX_OBJECT_DEPTH) return TRUNCATION_MARKER;

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_LENGTH)
      .map(item => serializeValue(item, depth + 1));
    return value.length > MAX_ARRAY_LENGTH
      ? [...items, TRUNCATION_MARKER]
      : items;
  }

  // Not a plain object literal (Map, Set, class instance, engine node, ...) — nothing here
  // round-trips through JSON, so treat it as opaque rather than serializing internals a
  // consumer never asked to see.
  if (!isPlainObject(value)) return '[Object]';

  const result: Record<string, unknown> = {};
  for (const [key, propValue] of Object.entries(value)) {
    result[key] = serializeValue(propValue, depth + 1);
  }
  return result;
}

function serializeProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    result[key] = serializeValue(value, 0);
  }
  return result;
}

function getTextPreview(node: ISymbioteNode): string | undefined {
  if (node.component !== RAW_TEXT_COMPONENT) return undefined;
  const text = node.props.text;
  if (typeof text !== 'string') return undefined;
  return truncateString(text, TEXT_PREVIEW_LENGTH);
}

// Mirrors core/engine/src/commit.ts's renderableChildren: an anchor (Vue fragment/v-if/v-for
// placeholder, Angular component host) never becomes a Fabric view — the commit walk skips it
// and flattens its own children into the parent's list. The devtools tree represents what
// actually becomes a native view, so it does the same flatten instead of showing bare "#anchor"
// noise a developer can't do anything with. Not exported from the engine itself (adding it to
// the public barrel would require the cross-adapter parity gate in every adapter for a
// devtools-only utility), so reimplemented here against the already-serialized shape.
function renderableChildren(node: ISymbioteNode): ISymbioteNode[] {
  const children: ISymbioteNode[] = [];
  for (const child of node.children) {
    if (isAnchor(child)) children.push(...renderableChildren(child));
    else children.push(child);
  }
  return children;
}

// Mutable, shared across one whole `serializeSurfaceTree` call (every root, every descendant) —
// what actually enforces MAX_SERIALIZED_NODES as a TOTAL across the payload, not per-subtree.
type IBudget = { remaining: number };

// `depth` is capped independently of `remaining`: a deeply-nested-navigator screen can stay
// UNDER the node-count budget while still being pathologically deep (many screens, each adding
// only a handful of wrapper views, compounding into hundreds of levels) — MAX_TREE_DEPTH bounds
// this recursion's own call depth to a fixed, safe constant regardless of the real tree's shape,
// rather than relying on Hermes's stack limit (generally larger than a browser tab's, but not
// unlimited) to save it.
function serializeNodeBounded(
  node: ISymbioteNode,
  depth: number,
  budget: IBudget,
): ISerializedNode {
  budget.remaining -= 1;
  const textPreview = getTextPreview(node);
  const kids = renderableChildren(node);

  const children: ISerializedNode[] = [];
  let truncatedChildCount = 0;
  // `depth` counts ancestors (root = 0), so a node at `depth` is the (depth + 1)th level — this
  // node is always included regardless; the check only decides whether ITS children (the NEXT
  // level) get created. Cutting once `depth` reaches `MAX_TREE_DEPTH - 1` keeps the total number
  // of levels at exactly `MAX_TREE_DEPTH`, not `MAX_TREE_DEPTH + 1`.
  if (depth >= MAX_TREE_DEPTH - 1) {
    truncatedChildCount = kids.length;
  } else {
    for (const child of kids) {
      if (budget.remaining <= 0) {
        truncatedChildCount += kids.length - children.length;
        break;
      }
      children.push(serializeNodeBounded(child, depth + 1, budget));
    }
  }

  const base: ISerializedNode = {
    id: getStableNodeId(node),
    component: node.component,
    isText: node.isText,
    props: serializeProps(node.props),
    children,
  };
  const withText = textPreview === undefined ? base : { ...base, textPreview };
  const withOwner =
    node.owner === undefined ? withText : { ...withText, owner: node.owner };
  return truncatedChildCount === 0
    ? withOwner
    : { ...withOwner, truncatedChildCount };
}

// Public, single-node entry point — used directly by callers/tests wanting one node's own
// subtree serialized without the whole-payload node-count cap, which only matters when shipping
// a FULL surface snapshot over the wire (serializeSurfaceTree, below). Still depth-capped: no
// caller should ever recurse pathologically deep, budget or not.
export function serializeNode(node: ISymbioteNode): ISerializedNode {
  return serializeNodeBounded(node, 0, { remaining: Infinity });
}

export function serializeSurfaceTree(
  nodes: readonly ISymbioteNode[],
): ISerializedNode[] {
  const roots: ISymbioteNode[] = [];
  for (const node of nodes) {
    if (isAnchor(node)) roots.push(...renderableChildren(node));
    else roots.push(node);
  }
  const budget: IBudget = { remaining: MAX_SERIALIZED_NODES };
  const result: ISerializedNode[] = [];
  for (const root of roots) {
    // A budget exhausted BETWEEN roots (not within one root's own children) has no parent node
    // to attach `truncatedChildCount` to — narrow, silent edge case, only reachable when a single
    // surface snapshot call has enough independent top-level roots to exhaust MAX_SERIALIZED_NODES
    // on its own; real apps have a small, fixed number of roots (one per active surface plus
    // however many render at a surface's own top level), so budget exhaustion in practice always
    // happens WITHIN a root's subtree, where it IS signaled.
    if (budget.remaining <= 0) break;
    result.push(serializeNodeBounded(root, 0, budget));
  }
  return result;
}
