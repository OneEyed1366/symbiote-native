import {
  createAnchor,
  createElement,
  createRawText,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { describe, expect, it } from 'vitest';
import {
  MAX_SERIALIZED_NODES,
  MAX_TREE_DEPTH,
  serializeNode,
  serializeSurfaceTree,
} from './serialize-tree';
import type { ISerializedNode } from './protocol';

function countSerializedNodes(nodes: readonly ISerializedNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + countSerializedNodes(node.children),
    0,
  );
}

function serializedDepth(node: ISerializedNode): number {
  return node.children.length === 0
    ? 1
    : 1 + Math.max(...node.children.map(serializedDepth));
}

function buildChain(length: number): ISymbioteNode {
  const root = createElement('RCTView');
  let cursor = root;
  for (let level = 1; level < length; level += 1) {
    const child = createElement('RCTView');
    child.parent = cursor;
    cursor.children.push(child);
    cursor = child;
  }
  return root;
}

function expectArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('expected an array');
  return value;
}

function expectString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('expected a string');
  return value;
}

describe('serializeSurfaceTree', () => {
  it('produces a JSON-safe, bounded snapshot of a hand-built tree', () => {
    const root = createElement('RCTView');
    root.props = {
      onPress: () => {},
      items: Array.from({ length: 60 }, (_, index) => index),
      nested: { a: { b: { c: { d: { e: { f: 'too deep' } } } } } },
      longString: 'x'.repeat(600),
    };

    const text = createRawText('a'.repeat(120));
    text.parent = root;
    root.children.push(text);

    const [serializedRoot] = serializeSurfaceTree([root]);

    expect(serializedRoot.component).toBe('RCTView');
    expect(serializedRoot.isText).toBe(false);
    expect(serializedRoot.textPreview).toBeUndefined();

    // function props become a placeholder, never the function itself
    expect(serializedRoot.props.onPress).toBe('[Function]');

    // array length capped at 50 + a trailing truncation marker
    const items = expectArray(serializedRoot.props.items);
    expect(items).toHaveLength(51);
    expect(items[50]).toBe('…');

    // object nesting capped at depth 5 (a-b-c-d-e is depth 5; f would be depth 6)
    expect(serializedRoot.props.nested).toEqual({
      a: { b: { c: { d: { e: '…' } } } },
    });

    // long strings truncated to 500 chars + a trailing marker
    const longString = expectString(serializedRoot.props.longString);
    expect(longString.length).toBe(501);
    expect(longString.endsWith('…')).toBe(true);

    // raw-text child gets a bounded textPreview, truncated to 80 chars + a marker
    const [serializedText] = serializedRoot.children;
    expect(serializedText.component).toBe('RCTRawText');
    expect(serializedText.textPreview).toBe(`${'a'.repeat(80)}…`);
  });

  it('assigns a stable id to the same node object across two serialization calls', () => {
    const node = createElement('RCTView');
    const first = serializeNode(node);
    const second = serializeNode(node);
    expect(second.id).toBe(first.id);
  });

  it('assigns different ids to different node objects', () => {
    const first = serializeNode(createElement('RCTView'));
    const second = serializeNode(createElement('RCTView'));
    expect(first.id).not.toBe(second.id);
  });

  it('omits textPreview for a non-text node', () => {
    const node = serializeNode(createElement('RCTView'));
    expect(node.textPreview).toBeUndefined();
  });

  it('treats a class instance / Map as opaque rather than serializing its internals', () => {
    const node = createElement('RCTView');
    node.props = { handle: new Map([['a', 1]]) };
    const [serialized] = serializeSurfaceTree([node]);
    expect(serialized.props.handle).toBe('[Object]');
  });

  it('flattens an anchor node into its parent, mirroring commit.ts renderableChildren', () => {
    const root = createElement('RCTView');
    const before = createElement('RCTText');
    before.parent = root;
    const anchor = createAnchor();
    anchor.parent = root;
    const anchorChildA = createElement('RCTView');
    anchorChildA.parent = anchor;
    const anchorChildB = createElement('RCTText');
    anchorChildB.parent = anchor;
    anchor.children.push(anchorChildA, anchorChildB);
    const after = createElement('RCTImageView');
    after.parent = root;
    root.children.push(before, anchor, after);

    const [serializedRoot] = serializeSurfaceTree([root]);

    // The anchor itself never appears; its two children land in its place, in order.
    expect(serializedRoot.children.map(child => child.component)).toEqual([
      'RCTText',
      'RCTView',
      'RCTText',
      'RCTImageView',
    ]);
  });

  it('flattens an anchor at the surface root, not just mid-tree', () => {
    const anchor = createAnchor();
    const child = createElement('RCTView');
    child.parent = anchor;
    anchor.children.push(child);

    const serialized = serializeSurfaceTree([anchor]);

    expect(serialized).toHaveLength(1);
    expect(serialized[0].component).toBe('RCTView');
  });

  it('caps total serialized node count and marks the cut point, never silently', () => {
    // why: this is the real-device crash's node-count half — a screen with more native nodes
    // than the budget must NOT ship them all as one unbounded JSON payload, and the truncation
    // must be visible on the wire, not just quietly incomplete.
    const root = createElement('RCTView');
    const childCount = MAX_SERIALIZED_NODES + 500;
    for (let index = 0; index < childCount; index += 1) {
      const child = createElement('RCTView');
      child.parent = root;
      root.children.push(child);
    }

    const serialized = serializeSurfaceTree([root]);

    expect(countSerializedNodes(serialized)).toBeLessThanOrEqual(
      MAX_SERIALIZED_NODES,
    );
    const [serializedRoot] = serialized;
    expect(serializedRoot.truncatedChildCount).toBe(
      childCount - serializedRoot.children.length,
    );
    expect(serializedRoot.truncatedChildCount).toBeGreaterThan(0);
  });

  it('caps tree depth independently of node count and marks the cut point', () => {
    // why: the real crash was a screen that stayed narrow (few nodes per level) but ran hundreds
    // of levels deep — a node-count budget alone doesn't bound THAT shape; MAX_TREE_DEPTH does.
    const deepChain = buildChain(MAX_TREE_DEPTH + 100);

    const [serialized] = serializeSurfaceTree([deepChain]);

    expect(serializedDepth(serialized)).toBeLessThanOrEqual(MAX_TREE_DEPTH);
    // Walk to the deepest serialized node — it must carry the truncation marker, since its one
    // real child (the chain continues) was cut by the depth cap, not the node-count budget.
    let deepest = serialized;
    while (deepest.children.length > 0) deepest = deepest.children[0];
    expect(deepest.truncatedChildCount).toBe(1);
  });

  it('serializeNode (single-node, direct callers) stays uncapped on node count', () => {
    // why: serializeNode is the public single-subtree entry point tests and other direct
    // callers use — only serializeSurfaceTree (the whole-payload-over-the-wire path) should pay
    // the node-count budget.
    const root = createElement('RCTView');
    for (let index = 0; index < MAX_SERIALIZED_NODES + 50; index += 1) {
      const child = createElement('RCTView');
      child.parent = root;
      root.children.push(child);
    }

    const serialized = serializeNode(root);

    expect(serialized.children).toHaveLength(MAX_SERIALIZED_NODES + 50);
    expect(serialized.truncatedChildCount).toBeUndefined();
  });
});
