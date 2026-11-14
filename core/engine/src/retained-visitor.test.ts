// The write half of a retained tree host: what each op does to the node graph, and which effect
// it hands the host afterwards. A fake store stands in for a host's own node type

import { beforeEach, describe, expect, it } from 'vitest';

import {
  recordAppendChild,
  recordCommit,
  recordCreateAnchor,
  recordCreateElement,
  recordCreateRawText,
  recordCreateVoid,
  recordInsertBefore,
  recordRemoveChild,
  recordSetComponent,
  recordSetOwnedListener,
  recordSetProp,
  recordSetTag,
  recordSetText,
  recordSetUnderlayShown,
  resetMutationBuffer,
  takeBatch,
  type IMutationHandle,
} from './mutation-buffer';
import { walkOps } from './mutation-walk';
import type { IRetainedNode } from './retained-tree';
import {
  createRetainedVisitor,
  RETAINED_KIND,
  type IRetainedCreate,
  type IRetainedEffects,
  type IRetainedNodeState,
} from './retained-visitor';

const ROOT_TAG = 5;

type ITestNode = IRetainedNodeState<ITestNode> & {
  spec: IRetainedCreate;
};

function newHandle(): IMutationHandle {
  return { slot: 0, slotBatch: 0, createdBatch: 0 };
}

function setup(effects: IRetainedEffects<ITestNode> = {}): {
  nodes: Map<object, ITestNode>;
  apply: () => void;
} {
  const nodes = new Map<object, ITestNode>();
  const visitor = createRetainedVisitor<ITestNode>(
    {
      at: handle => {
        const node = nodes.get(handle);
        if (node === undefined) throw new Error('unknown handle');
        return node;
      },
      create: (handle, spec) => {
        const node: ITestNode = {
          handle,
          spec,
          viewName: spec.viewName,
          props: spec.text === undefined ? {} : { text: spec.text },
          tagName: '',
          ownedListeners: {},
          underlayShown: false,
          parent: undefined,
          children: [],
          committedRootTag: undefined,
        };
        nodes.set(handle, node);
      },
    },
    effects,
  );
  return { nodes, apply: () => walkOps(takeBatch(), visitor) };
}

// Keeps the `IRetainedNode` import honest: the state type extends it
const asReadable = (node: ITestNode): IRetainedNode<ITestNode> => node;

function childNames(
  nodes: Map<object, ITestNode>,
  parent: object,
  names: Map<object, string>,
): string[] {
  const node = nodes.get(parent);
  return (node?.children ?? []).map(child => names.get(child.handle) ?? '?');
}

describe('retained visitor', () => {
  beforeEach(() => {
    resetMutationBuffer();
  });

  it('tells the store what each create op made', () => {
    const element = newHandle();
    const text = newHandle();
    const hollow = newHandle();
    const hole = newHandle();
    recordCreateElement(element, 'RCTView', false, 'instance');
    recordCreateRawText(text, 'hi');
    recordCreateAnchor(hollow);
    recordCreateVoid(hole);
    const { nodes, apply } = setup();
    apply();

    expect(nodes.get(element)?.spec).toEqual({
      kind: RETAINED_KIND.element,
      viewName: 'RCTView',
      instanceHandle: 'instance',
    });
    expect(nodes.get(text)?.spec).toEqual({
      kind: RETAINED_KIND.text,
      viewName: 'RCTRawText',
      text: 'hi',
    });
    expect(nodes.get(hollow)?.spec.kind).toBe(RETAINED_KIND.anchor);
    expect(nodes.get(hole)?.spec.kind).toBe(RETAINED_KIND.void);
  });

  describe('structure', () => {
    function threeChildren(): {
      parent: IMutationHandle;
      a: IMutationHandle;
      b: IMutationHandle;
      c: IMutationHandle;
      names: Map<object, string>;
    } {
      const [parent, a, b, c] = [
        newHandle(),
        newHandle(),
        newHandle(),
        newHandle(),
      ];
      for (const handle of [parent, a, b, c]) {
        recordCreateElement(handle, 'RCTView', false, handle);
      }
      const names = new Map<object, string>([
        [parent, 'parent'],
        [a, 'a'],
        [b, 'b'],
        [c, 'c'],
      ]);
      return { parent, a, b, c, names };
    }

    it('appends last and inserts before a named sibling', () => {
      const { parent, a, b, c, names } = threeChildren();
      recordAppendChild(parent, a);
      recordAppendChild(parent, c);
      recordInsertBefore(parent, b, c);
      const { nodes, apply } = setup();
      apply();

      expect(childNames(nodes, parent, names)).toEqual(['a', 'b', 'c']);
      expect(nodes.get(b)?.parent).toBe(nodes.get(parent));
    });

    it('appends when the sibling to insert before is not a child', () => {
      const { parent, a, b, c, names } = threeChildren();
      recordAppendChild(parent, a);
      recordInsertBefore(parent, b, c);
      const { nodes, apply } = setup();
      apply();

      expect(childNames(nodes, parent, names)).toEqual(['a', 'b']);
    });

    it('moves a child that is appended under a new parent', () => {
      const { parent, a, b, names } = threeChildren();
      recordAppendChild(parent, a);
      recordAppendChild(a, b);
      recordAppendChild(parent, b);
      const { nodes, apply } = setup();
      apply();

      expect(childNames(nodes, a, names)).toEqual([]);
      expect(childNames(nodes, parent, names)).toEqual(['a', 'b']);
    });

    it('cuts the parent link on a removal', () => {
      const { parent, a, names } = threeChildren();
      recordAppendChild(parent, a);
      recordRemoveChild(parent, a);
      const { nodes, apply } = setup();
      apply();

      expect(childNames(nodes, parent, names)).toEqual([]);
      expect(nodes.get(a)?.parent).toBeUndefined();
    });
  });

  describe('writes on a node', () => {
    it('keeps props, tag, listeners and underlay on the node', () => {
      const node = newHandle();
      recordCreateElement(node, 'RCTView', false, node);
      recordSetProp(node, 'opacity', 0.5);
      recordSetProp(node, 'gone', 1);
      recordSetProp(node, 'gone', undefined);
      recordSetTag(node, 'pressable');
      recordSetOwnedListener(node, 'onPress', true);
      recordSetUnderlayShown(node, true);
      const { nodes, apply } = setup();
      apply();

      const written = nodes.get(node);
      expect(written?.props).toEqual({ opacity: 0.5 });
      expect(written?.tagName).toBe('pressable');
      expect(written?.ownedListeners).toEqual({ onPress: true });
      expect(written?.underlayShown).toBe(true);
    });

    it('keeps the new view name and text', () => {
      const node = newHandle();
      recordCreateElement(node, 'RCTText', true, node);
      recordSetComponent(node, 'RCTVirtualText');
      recordSetText(node, 'caption');
      const { nodes, apply } = setup();
      apply();

      expect(nodes.get(node)?.viewName).toBe('RCTVirtualText');
      expect(nodes.get(node)?.props.text).toBe('caption');
    });
  });

  describe('commit', () => {
    it('lands the root tag on the whole subtree, nodes cut off later keep it', () => {
      const surface = newHandle();
      const child = newHandle();
      recordCreateElement(surface, 'RCTView', false, surface);
      recordCreateElement(child, 'RCTView', false, child);
      recordAppendChild(surface, child);
      recordCommit(ROOT_TAG, surface);
      recordRemoveChild(surface, child);
      const { nodes, apply } = setup();
      apply();

      expect(nodes.get(surface)?.committedRootTag).toBe(ROOT_TAG);
      expect(nodes.get(child)?.committedRootTag).toBe(ROOT_TAG);
    });
  });

  describe('effects', () => {
    it('run after the graph changed, in op order', () => {
      const parent = newHandle();
      const child = newHandle();
      recordCreateElement(parent, 'RCTView', false, parent);
      recordCreateElement(child, 'RCTView', false, child);
      recordAppendChild(parent, child);
      recordSetText(child, 'x');
      recordSetComponent(child, 'RCTText');
      recordRemoveChild(parent, child);
      recordCommit(ROOT_TAG, parent);
      const log: string[] = [];
      const { nodes, apply } = setup({
        placed: node => log.push(`placed under ${node.parent?.viewName}`),
        removed: node => log.push(`removed, parent ${String(node.parent)}`),
        textChanged: (_node, text) => log.push(`text ${text}`),
        componentChanged: node => log.push(`component ${node.viewName}`),
        committed: rootTag => log.push(`committed ${rootTag}`),
      });
      apply();

      expect(log).toEqual([
        'placed under RCTView',
        'text x',
        'component RCTText',
        'removed, parent undefined',
        'committed 5',
      ]);
      expect(asReadable(nodes.get(parent) as ITestNode).children).toEqual([]);
    });

    it('name a node whose prop was set or deleted, after the bag changed', () => {
      const node = newHandle();
      recordCreateElement(node, 'RCTView', false, node);
      recordSetProp(node, 'opacity', 0.5);
      recordSetProp(node, 'opacity', undefined);
      const seen: Record<string, unknown>[] = [];
      const { apply } = setup({
        propChanged: changed => seen.push({ ...changed.props }),
      });
      apply();

      expect(seen).toEqual([{ opacity: 0.5 }, {}]);
    });

    it('name a node whose owned listener came or went, after the flag changed', () => {
      const node = newHandle();
      recordCreateElement(node, 'RCTView', false, node);
      recordSetOwnedListener(node, 'press', true);
      recordSetOwnedListener(node, 'press', false);
      const seen: Record<string, boolean>[] = [];
      const { apply } = setup({
        propChanged: changed => seen.push({ ...changed.ownedListeners }),
      });
      apply();

      expect(seen).toEqual([{ press: true }, { press: false }]);
    });

    it('name a node whose underlay was shown or hidden, after the flag changed', () => {
      const node = newHandle();
      recordCreateElement(node, 'RCTView', false, node);
      recordSetUnderlayShown(node, true);
      recordSetUnderlayShown(node, false);
      const seen: boolean[] = [];
      const { apply } = setup({
        propChanged: changed => seen.push(changed.underlayShown),
      });
      apply();

      expect(seen).toEqual([true, false]);
    });

    it('read the text prop of a raw text node as a change of its text', () => {
      const text = newHandle();
      recordCreateRawText(text, '');
      recordSetProp(text, 'text', 'Save');
      const seen: string[] = [];
      const { apply } = setup({
        textChanged: (_node, changed) => seen.push(changed),
      });
      apply();

      expect(seen).toEqual(['Save']);
    });

    it('keep a text prop of an element a plain prop', () => {
      const node = newHandle();
      recordCreateElement(node, 'RCTView', false, node);
      recordSetProp(node, 'text', 'x');
      const seen: string[] = [];
      const { apply } = setup({
        textChanged: (_node, changed) => seen.push(changed),
      });
      apply();

      expect(seen).toEqual([]);
    });
  });
});
