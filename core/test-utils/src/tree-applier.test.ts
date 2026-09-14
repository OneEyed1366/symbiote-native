// The reference applier's own coverage.
//
// It needs its own tests before anything depends on it, because it is about to become the oracle the
// C++ is checked against — an oracle nobody exercised is worth exactly as much as no oracle. Every
// case here pins a rule that survived the collapse of `commit.ts`, and each one was broken
// deliberately once (the change is named beside it) to confirm it can fail.

import { beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from './fake-fabric';
import {
  recordAppendChild,
  recordCommit,
  recordCreateAnchor,
  recordCreateElement,
  recordCreateRawText,
  recordInsertBefore,
  recordRemoveChild,
  recordSetProp,
  recordSetText,
  resetMutationBuffer,
  takeBatch,
} from '@symbiote-native/engine/mutation-buffer';
import { applyBatch } from './tree-applier';
import { getSlot, resetSlot, type IFabricSlot } from '@symbiote-native/engine';

const ROOT_TAG = 1;

/** A handle is a bare object — exactly what the adapter will hold, and all it will hold. */
function handle(): object {
  return {};
}

function element(viewName: string, isText = false): object {
  const node = handle();
  recordCreateElement(node, viewName, isText, node);
  return node;
}

function shapeOf(nodes: readonly IFakeNode[]): unknown {
  return nodes.map(node => ({
    viewName: node.viewName,
    children: shapeOf(node.children),
  }));
}

describe('the reference tree applier', () => {
  beforeEach(() => {
    resetMutationBuffer();
  });

  function drive(): {
    slot: IFabricSlot;
    fabric: ReturnType<typeof installFabric>;
  } {
    const fabric = installFabric();
    resetSlot();
    return { slot: getSlot(), fabric };
  }

  it('commits the tree the ops describe', () => {
    const { slot, fabric } = drive();
    const surface = handle();
    recordCreateAnchor(surface);
    const view = element('RCTView');
    const text = element('RCTText', true);
    recordAppendChild(view, text);
    recordAppendChild(surface, view);
    recordCommit(ROOT_TAG, surface);

    applyBatch(takeBatch(), slot);

    expect(shapeOf(fabric.committed)).toEqual([
      {
        viewName: 'RCTView',
        children: [{ viewName: 'RCTText', children: [] }],
      },
    ]);
    expect(fabric.counts.createNode).toBe(2);
    expect(fabric.counts.completeRoot).toBe(1);
  });

  // Break-tested by deleting the KIND_ANCHOR branch in `appendRenderable`: the anchor commits as a
  // node of its own and the shape gains a level.
  it('hoists an anchor’s children in its place, and never commits the anchor', () => {
    const { slot, fabric } = drive();
    const surface = handle();
    recordCreateAnchor(surface);
    const parent = element('RCTView');
    const anchor = handle();
    recordCreateAnchor(anchor);
    const a = element('RCTView');
    const b = element('RCTView');
    recordAppendChild(anchor, a);
    recordAppendChild(anchor, b);
    recordAppendChild(parent, anchor);
    recordAppendChild(surface, parent);
    recordCommit(ROOT_TAG, surface);

    applyBatch(takeBatch(), slot);

    expect(shapeOf(fabric.committed)).toEqual([
      {
        viewName: 'RCTView',
        children: [
          { viewName: 'RCTView', children: [] },
          { viewName: 'RCTView', children: [] },
        ],
      },
    ]);
    // Three views, not four: the anchor is ours and never becomes a Fabric node.
    expect(fabric.counts.createNode).toBe(3);
  });

  // Break-tested by deleting the `isEmptyRawText` guard: the empty node commits and would paint.
  it('skips an empty raw text, and lets it back in when it gains text', () => {
    const { slot, fabric } = drive();
    const surface = handle();
    recordCreateAnchor(surface);
    const text = element('RCTText', true);
    const raw = handle();
    recordCreateRawText(raw, '');
    recordAppendChild(text, raw);
    recordAppendChild(surface, text);
    recordCommit(ROOT_TAG, surface);
    applyBatch(takeBatch(), slot);

    expect(shapeOf(fabric.committed)).toEqual([
      { viewName: 'RCTText', children: [] },
    ]);

    recordSetText(raw, 'hello');
    recordCommit(ROOT_TAG, surface);
    applyBatch(takeBatch(), slot);

    expect(shapeOf(fabric.committed)).toEqual([
      {
        viewName: 'RCTText',
        children: [{ viewName: 'RCTRawText', children: [] }],
      },
    ]);
  });

  // The rule is STICKY, and the View in the middle is the whole point: `commit.ts:964` threaded
  // `node.isText || hasTextAncestor`, so a non-text element does NOT reset it. Break-tested by
  // passing `node.isText` alone, which leaves the inner text as RCTText.
  it('makes a text inside a text virtual, through a non-text element in between', () => {
    const { slot, fabric } = drive();
    const surface = handle();
    recordCreateAnchor(surface);
    const outer = element('RCTText', true);
    const middle = element('RCTView');
    const inner = element('RCTText', true);
    recordAppendChild(middle, inner);
    recordAppendChild(outer, middle);
    recordAppendChild(surface, outer);
    recordCommit(ROOT_TAG, surface);

    applyBatch(takeBatch(), slot);

    expect(shapeOf(fabric.committed)).toEqual([
      {
        viewName: 'RCTText',
        children: [
          {
            viewName: 'RCTView',
            children: [{ viewName: 'RCTVirtualText', children: [] }],
          },
        ],
      },
    ]);
  });

  // The dirty pair is what makes a commit cheap rather than a full walk. Break-tested by removing
  // the early return in `materialize`: the untouched sibling clones too and the count doubles.
  it('hands back an untouched subtree without cloning it', () => {
    const { slot, fabric } = drive();
    const surface = handle();
    recordCreateAnchor(surface);
    const touched = element('RCTView');
    const untouched = element('RCTView');
    recordAppendChild(untouched, element('RCTView'));
    recordAppendChild(surface, touched);
    recordAppendChild(surface, untouched);
    recordCommit(ROOT_TAG, surface);
    applyBatch(takeBatch(), slot);

    const clonesAfterCreate = fabric.counts.clone;
    recordSetProp(touched, 'testID', 'moved');
    recordCommit(ROOT_TAG, surface);
    applyBatch(takeBatch(), slot);

    // Exactly one node was rebuilt. The untouched sibling and its child contributed nothing.
    expect(fabric.counts.clone - clonesAfterCreate).toBe(1);
  });

  // `cloneNodeWithNewProps` MERGES, so the payload must be a minimal diff and a vanished key must
  // arrive as an explicit null. Break-tested by sending `node.props` whole: `unchanged` reappears in
  // the payload, which re-invokes its native setter.
  it('sends only what changed, and spells a removed key as null', () => {
    const { slot, fabric } = drive();
    const surface = handle();
    recordCreateAnchor(surface);
    const view = element('RCTView');
    recordSetProp(view, 'unchanged', 'same');
    recordSetProp(view, 'goes', 'away');
    recordAppendChild(surface, view);
    recordCommit(ROOT_TAG, surface);
    applyBatch(takeBatch(), slot);

    const payloads: Record<string, unknown>[] = [];
    const recording: IFabricSlot = {
      ...slot,
      cloneNodeWithNewChildrenAndProps: (node, props, children) => {
        payloads.push(props);
        return slot.cloneNodeWithNewChildrenAndProps(node, props, children);
      },
      cloneNodeWithNewProps: (node, props) => {
        payloads.push(props);
        return slot.cloneNodeWithNewProps(node, props);
      },
    };

    recordSetProp(view, 'added', 'new');
    recordSetProp(view, 'goes', undefined);
    recordCommit(ROOT_TAG, surface);
    applyBatch(takeBatch(), recording);

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual({ added: 'new', goes: null });
    expect(fabric.committed).toBeDefined();
  });

  // A CHILD LIST IS NOT A FREE ARGUMENT, and the fake cannot show why — so the assertable thing is
  // the ROUTING, not the tree. Real Fabric re-adopts every child of a list it is handed
  // (`YogaLayoutableShadowNode::adoptYogaChild`), and a child still owned by its previous parent's
  // yoga node is CLONED and swapped in behind the caller's back — RN's own TODO there says the
  // caller is left holding the wrong reference. So a props-only change on a parent of a thousand
  // rows re-clones all thousand, every commit. Both hosts have to draw the same line, and the C++
  // one is where it costs.
  //
  // Two-sided on purpose: dropping the child list unconditionally passes the first arm.
  it('hands over a child list only when it changed', () => {
    const { slot } = drive();
    const surface = handle();
    recordCreateAnchor(surface);
    const parent = element('RCTView');
    recordAppendChild(parent, element('RCTView'));
    recordAppendChild(surface, parent);
    recordCommit(ROOT_TAG, surface);
    applyBatch(takeBatch(), slot);

    const doors: string[] = [];
    const recording: IFabricSlot = {
      ...slot,
      cloneNodeWithNewProps: (node, props) => {
        doors.push('props');
        return slot.cloneNodeWithNewProps(node, props);
      },
      cloneNodeWithNewChildrenAndProps: (node, props, children) => {
        doors.push('childrenAndProps');
        return slot.cloneNodeWithNewChildrenAndProps(node, props, children);
      },
      cloneNodeWithNewChildren: (node, children) => {
        doors.push('children');
        return slot.cloneNodeWithNewChildren(node, children);
      },
    };

    recordSetProp(parent, 'testID', 'moved');
    recordCommit(ROOT_TAG, surface);
    applyBatch(takeBatch(), recording);
    expect(doors).toEqual(['props']);

    doors.length = 0;
    recordAppendChild(parent, element('RCTView'));
    recordSetProp(parent, 'testID', 'moved again');
    recordCommit(ROOT_TAG, surface);
    applyBatch(takeBatch(), recording);
    expect(doors).toEqual(['childrenAndProps']);
  });

  // Break-tested by ignoring the `before` operand and always pushing: the order comes out b, a.
  it('honours insertBefore, and a remove that names a stale parent is a no-op', () => {
    const { slot, fabric } = drive();
    const surface = handle();
    recordCreateAnchor(surface);
    const parent = element('RCTView');
    const a = element('RCTView');
    const b = element('RCTView');
    recordSetProp(a, 'testID', 'a');
    recordSetProp(b, 'testID', 'b');
    recordAppendChild(parent, b);
    recordInsertBefore(parent, a, b);
    recordAppendChild(surface, parent);
    recordCommit(ROOT_TAG, surface);
    applyBatch(takeBatch(), slot);

    expect(
      fabric.committed[0].children.map(child => child.props.testID),
    ).toEqual(['a', 'b']);

    // `a` is moved out by an insert elsewhere and only THEN removed from its old parent — the
    // remove-then-insert spelling arriving out of order, which frameworks do produce.
    const other = element('RCTView');
    recordAppendChild(surface, other);
    recordAppendChild(other, a);
    recordRemoveChild(parent, a);
    recordCommit(ROOT_TAG, surface);
    applyBatch(takeBatch(), slot);

    expect(
      fabric.committed[0].children.map(child => child.props.testID),
    ).toEqual(['b']);
    expect(
      fabric.committed[1].children.map(child => child.props.testID),
    ).toEqual(['a']);
  });
});
