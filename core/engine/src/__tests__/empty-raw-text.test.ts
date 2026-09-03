// An empty RCTRawText must never reach a child set. This is not a tidiness rule — it is a hard
// native crash, and the engine is the only place that can close it for every adapter at once.
//
// Fabric assembles a <Text> by walking its children (BaseTextShadowNode::buildAttributedString):
// a raw-text child becomes a fragment, EXCEPT that AttributedString::appendFragment silently drops
// a fragment whose string is empty — while the walk has already recorded "the previous child was
// raw text". The next raw-text sibling therefore takes the merge branch and calls
// `fragments.back()` on a vector that is still empty, which aborts the process (SIGABRT inside
// std::vector::back, diagnosed on the iOS simulator 2026-08-19). React Native's own renderer has
// the same hole, so this cannot be pinned on one adapter; it belongs at the single seam where the
// retained tree becomes Fabric's child set.
//
// No Negative group: the commit walk has no throwing path here — an empty raw text is dropped, not
// rejected.

import { beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  setText,
} from '../index';

const fabric = installFabric();
const ROOT_TAG = 4_207;

// The raw-text strings actually committed under `parent`, in child order.
function textsUnder(parent: IFakeNode): unknown[] {
  return parent.children
    .filter(child => child.viewName === 'RCTRawText')
    .map(child => child.props.text);
}

describe('an empty raw text is kept out of the committed child set', () => {
  beforeEach(() => fabric.reset());

  // why: this is the exact shape that aborts on device — an empty fragment followed by a real one.
  it('commits only the non-empty sibling', () => {
    const surface = createSurface(ROOT_TAG);
    const text = createElement('RCTText', true);
    appendChild(text, createRawText(''));
    appendChild(text, createRawText(' trailing'));
    surface.appendChild(text);
    surface.commit();

    const committed = fabric.appRoot().children[0];
    expect(textsUnder(committed)).toEqual([' trailing']);
  });

  // why: a whitespace-only string is REAL content in a <Text> ("a" + " " + "b" reads as "a b"), so
  // the rule is "empty", never "blank" — this is what stops the fix from over-reaching.
  it('keeps a whitespace-only sibling, which is real text', () => {
    const surface = createSurface(ROOT_TAG + 1);
    const text = createElement('RCTText', true);
    appendChild(text, createRawText('a'));
    appendChild(text, createRawText(' '));
    appendChild(text, createRawText('b'));
    surface.appendChild(text);
    surface.commit();

    const committed = fabric.appRoot().children[0];
    expect(textsUnder(committed)).toEqual(['a', ' ', 'b']);
  });

  // why: emptying a text is a normal reactive update, not a teardown — the node has to come back
  // in its original position the moment it has content again.
  it('re-admits the node once it has text again', () => {
    const surface = createSurface(ROOT_TAG + 2);
    const text = createElement('RCTText', true);
    const first = createRawText('hello');
    appendChild(text, first);
    appendChild(text, createRawText(' world'));
    surface.appendChild(text);
    surface.commit();

    setText(first, '');
    surface.commit();
    expect(textsUnder(fabric.appRoot().children[0])).toEqual([' world']);

    setText(first, 'hi');
    surface.commit();
    expect(textsUnder(fabric.appRoot().children[0])).toEqual(['hi', ' world']);
  });
});
