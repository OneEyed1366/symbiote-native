// @vitest-environment happy-dom
// The DOM host turns a batch of ops into elements. Each case records ops the way an adapter does,
// applies the batch, and reads the document back

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
  recordSetText,
  resetMutationBuffer,
  takeBatch,
  type IMutationHandle,
} from '@symbiote-native/engine/mutation-buffer';
import { createDomHost } from './dom-host';

const ROOT_TAG = 7;

function newHandle(): IMutationHandle {
  return { slot: 0, slotBatch: 0, createdBatch: 0 };
}

function view(): IMutationHandle {
  const handle = newHandle();
  recordCreateElement(handle, 'RCTView', false, handle);
  return handle;
}

function anchor(): IMutationHandle {
  const handle = newHandle();
  recordCreateAnchor(handle);
  return handle;
}

function rawText(text: string): IMutationHandle {
  const handle = newHandle();
  recordCreateRawText(handle, text);
  return handle;
}

// Structure only: the reset classes are the props suite's business
const markup = (element: Element): string =>
  element.innerHTML.replace(/ class="[^"]*"/g, '');

describe('DOM host structure', () => {
  let container: HTMLElement;
  let host: ReturnType<typeof createDomHost>;

  const apply = (): void => host.applyOps(takeBatch());

  beforeEach(() => {
    resetMutationBuffer();
    container = document.createElement('div');
    host = createDomHost({ document });
    host.registerRoot(ROOT_TAG, container);
  });

  it('mounts the surface root under the registered container on commit', () => {
    const surface = view();
    recordCommit(ROOT_TAG, surface);
    apply();

    expect(markup(container)).toBe('<div></div>');
  });

  it('creates a div per RCTView and nests it under its parent', () => {
    const surface = view();
    const outer = view();
    const inner = view();
    recordAppendChild(surface, outer);
    recordAppendChild(outer, inner);
    recordCommit(ROOT_TAG, surface);
    apply();

    expect(markup(container)).toBe('<div><div><div></div></div></div>');
  });

  it('renders raw text as a text node and updates it on setText', () => {
    const surface = view();
    const label = view();
    const text = rawText('hello');
    recordAppendChild(surface, label);
    recordAppendChild(label, text);
    recordCommit(ROOT_TAG, surface);
    apply();
    expect(container.textContent).toBe('hello');

    recordSetText(text, 'bye');
    apply();
    expect(container.textContent).toBe('bye');
  });

  it('places an inserted child before its sibling', () => {
    const surface = view();
    const first = rawText('a');
    const last = rawText('c');
    const middle = rawText('b');
    recordAppendChild(surface, first);
    recordAppendChild(surface, last);
    recordCommit(ROOT_TAG, surface);
    apply();

    recordInsertBefore(surface, middle, last);
    apply();

    expect(container.textContent).toBe('abc');
  });

  it('removes a child from the document', () => {
    const surface = view();
    const kept = rawText('keep');
    const dropped = rawText('drop');
    recordAppendChild(surface, kept);
    recordAppendChild(surface, dropped);
    recordCommit(ROOT_TAG, surface);
    apply();

    recordRemoveChild(surface, dropped);
    apply();

    expect(container.textContent).toBe('keep');
  });

  it('moves a child that is appended under a new parent', () => {
    const surface = view();
    const left = view();
    const right = view();
    const mover = rawText('m');
    recordAppendChild(surface, left);
    recordAppendChild(surface, right);
    recordAppendChild(left, mover);
    recordCommit(ROOT_TAG, surface);
    apply();

    recordAppendChild(right, mover);
    apply();

    expect(markup(container)).toBe('<div><div></div><div>m</div></div>');
  });

  describe('anchors', () => {
    it('place their children in the parent, in order, with no element of their own', () => {
      const surface = view();
      const before = rawText('1');
      const slot = anchor();
      const inside = rawText('2');
      const after = rawText('3');
      recordAppendChild(surface, before);
      recordAppendChild(surface, slot);
      recordAppendChild(surface, after);
      recordAppendChild(slot, inside);
      recordCommit(ROOT_TAG, surface);
      apply();

      expect(markup(container)).toBe('<div>123</div>');
    });

    it('keep their position when children arrive after the first commit', () => {
      const surface = view();
      const slot = anchor();
      const after = rawText('end');
      recordAppendChild(surface, slot);
      recordAppendChild(surface, after);
      recordCommit(ROOT_TAG, surface);
      apply();

      recordAppendChild(slot, rawText('a'));
      recordAppendChild(slot, rawText('b'));
      apply();

      expect(container.textContent).toBe('abend');
    });

    it('take their children with them when the anchor is removed', () => {
      const surface = view();
      const slot = anchor();
      recordAppendChild(surface, slot);
      recordAppendChild(slot, rawText('x'));
      recordCommit(ROOT_TAG, surface);
      apply();

      recordRemoveChild(surface, slot);
      apply();

      expect(container.textContent).toBe('');
    });
  });

  it('never renders a void node or anything under it', () => {
    const surface = view();
    const hole = newHandle();
    recordCreateVoid(hole);
    recordAppendChild(surface, hole);
    recordAppendChild(hole, rawText('hidden'));
    recordCommit(ROOT_TAG, surface);
    apply();

    expect(container.textContent).toBe('');
  });

  it('keeps children when a node changes its view and needs another element', () => {
    const surface = view();
    const label = newHandle();
    recordCreateElement(label, 'RCTText', true, label);
    recordAppendChild(surface, label);
    recordAppendChild(label, rawText('nested'));
    recordCommit(ROOT_TAG, surface);
    apply();
    expect(markup(container)).toBe('<div><div>nested</div></div>');

    recordSetComponent(label, 'RCTVirtualText');
    apply();

    expect(markup(container)).toBe('<div><span>nested</span></div>');
  });

  describe('nested text', () => {
    function text(): IMutationHandle {
      const handle = newHandle();
      recordCreateElement(handle, 'RCTText', true, handle);
      return handle;
    }

    it('renders a text inside a text as an inline span, as the native commit walk does', () => {
      const surface = view();
      const outer = text();
      const inner = text();
      recordAppendChild(surface, outer);
      recordAppendChild(outer, rawText('a'));
      recordAppendChild(outer, inner);
      recordAppendChild(inner, rawText('b'));
      recordCommit(ROOT_TAG, surface);
      apply();

      expect(markup(container)).toBe('<div><div>a<span>b</span></div></div>');
    });

    it('sees through an anchor between the two texts', () => {
      const surface = view();
      const outer = text();
      const slot = anchor();
      const inner = text();
      recordAppendChild(surface, outer);
      recordAppendChild(outer, slot);
      recordAppendChild(slot, inner);
      recordAppendChild(inner, rawText('b'));
      recordCommit(ROOT_TAG, surface);
      apply();

      expect(markup(container)).toBe('<div><div><span>b</span></div></div>');
    });

    it('turns a text back into a block element when it leaves its parent text', () => {
      const surface = view();
      const outer = text();
      const inner = text();
      recordAppendChild(surface, outer);
      recordAppendChild(outer, inner);
      recordAppendChild(inner, rawText('b'));
      recordCommit(ROOT_TAG, surface);
      apply();
      expect(markup(container)).toBe('<div><div><span>b</span></div></div>');

      recordAppendChild(surface, inner);
      apply();

      expect(markup(container)).toBe('<div><div></div><div>b</div></div>');
    });

    it('starts a new text context inside a plain view carried under a text', () => {
      const surface = view();
      const outer = text();
      const box = view();
      const inner = text();
      recordAppendChild(surface, outer);
      recordAppendChild(outer, box);
      recordAppendChild(box, inner);
      recordAppendChild(inner, rawText('x'));
      recordCommit(ROOT_TAG, surface);
      apply();

      expect(markup(container)).toBe(
        '<div><div><div><div>x</div></div></div></div>',
      );
    });

    it('moves a whole text subtree that lands inside a text', () => {
      const surface = view();
      const outer = text();
      const middle = text();
      const deep = text();
      recordAppendChild(surface, middle);
      recordAppendChild(middle, deep);
      recordAppendChild(deep, rawText('d'));
      recordAppendChild(surface, outer);
      recordCommit(ROOT_TAG, surface);
      apply();
      expect(markup(container)).toBe(
        '<div><div><span>d</span></div><div></div></div>',
      );

      recordAppendChild(outer, middle);
      apply();

      expect(markup(container)).toBe(
        '<div><div><span><span>d</span></span></div></div>',
      );
    });
  });

  describe('tree reads', () => {
    it('answer from the logical tree, anchors included', () => {
      const surface = view();
      const slot = anchor();
      const child = view();
      recordAppendChild(surface, slot);
      recordAppendChild(slot, child);
      recordCommit(ROOT_TAG, surface);
      apply();

      expect(host.childrenOf(surface)).toEqual([slot]);
      expect(host.parentOf(child)).toBe(slot);
      expect(host.ancestorsOf(child)).toEqual([child, slot, surface]);
    });

    it('knows a committed node by the root it landed under', () => {
      const surface = view();
      const child = view();
      recordAppendChild(surface, child);
      recordCommit(ROOT_TAG, surface);
      apply();

      expect(host.committedRecordOf(child)?.rootTag).toBe(ROOT_TAG);
    });

    it('does not know a node that was never committed', () => {
      const lonely = view();
      apply();

      expect(host.committedRecordOf(lonely)).toBeUndefined();
    });
  });
});
