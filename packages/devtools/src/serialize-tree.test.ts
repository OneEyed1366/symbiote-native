import { createAnchor, createElement, createRawText } from '@symbiote-native/engine';
import { describe, expect, it } from 'vitest';
import { serializeNode, serializeSurfaceTree } from './serialize-tree';

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
    expect(serializedRoot.props.nested).toEqual({ a: { b: { c: { d: { e: '…' } } } } });

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
});
