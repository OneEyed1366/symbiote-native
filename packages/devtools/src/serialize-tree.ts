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
  return value.length > maxLength ? `${value.slice(0, maxLength)}${TRUNCATION_MARKER}` : value;
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
  if (typeof value === 'string') return truncateString(value, MAX_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'symbol') return '[Symbol]';
  if (typeof value === 'bigint') return `${value.toString()}n`;

  if (depth >= MAX_OBJECT_DEPTH) return TRUNCATION_MARKER;

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_LENGTH).map(item => serializeValue(item, depth + 1));
    return value.length > MAX_ARRAY_LENGTH ? [...items, TRUNCATION_MARKER] : items;
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

function serializeProps(props: Record<string, unknown>): Record<string, unknown> {
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

export function serializeNode(node: ISymbioteNode): ISerializedNode {
  const textPreview = getTextPreview(node);
  const base: ISerializedNode = {
    id: getStableNodeId(node),
    component: node.component,
    isText: node.isText,
    props: serializeProps(node.props),
    children: renderableChildren(node).map(serializeNode),
  };
  return textPreview === undefined ? base : { ...base, textPreview };
}

export function serializeSurfaceTree(nodes: readonly ISymbioteNode[]): ISerializedNode[] {
  const roots: ISymbioteNode[] = [];
  for (const node of nodes) {
    if (isAnchor(node)) roots.push(...renderableChildren(node));
    else roots.push(node);
  }
  return roots.map(serializeNode);
}
