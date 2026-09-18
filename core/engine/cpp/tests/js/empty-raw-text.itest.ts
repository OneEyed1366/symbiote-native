// An empty RCTRawText must never reach a child set. This is not a tidiness rule — it is a hard
// native crash, and the engine is the only place that can close it for every adapter at once.
//
// Fabric assembles a <Text> by walking its children (BaseTextShadowNode::buildAttributedString):
// a raw-text child becomes a fragment, EXCEPT that AttributedString::appendFragment silently drops
// a fragment whose string is empty — while the walk has already recorded "the previous child was
// raw text". The next raw-text sibling therefore takes the merge branch and calls `fragments.back()`
// on a vector that is still empty, which aborts the process (SIGABRT inside std::vector::back,
// diagnosed on the iOS simulator 2026-08-19). React Native's own renderer has the same hole, so this
// cannot be pinned on one adapter; it belongs at the single seam where the retained tree becomes
// Fabric's child set.
//
// Here rather than in vitest because the thing under test is which nodes reached Fabric, and until
// now that was answered by a TypeScript tree told the same rule. The abort is Fabric's, so the
// tree that has to be read is Fabric's.
//
// Raw text is VIRTUAL — it emits no mutation — so none of this is visible on `mounted()`. Read
// `committedShape()` for structure and `committedTexts()` for content.
//
// No Negative group: the commit walk has no throwing path here — an empty raw text is dropped, not
// rejected.

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  setText,
} from '@symbiote-native/engine';

import {
  committedShape,
  committedTexts,
  describe,
  expect,
  it,
  report,
} from './harness';

function paragraph() {
  return createElement('RCTText', true);
}

describe('an empty raw text is kept out of the committed child set', () => {
  // why: this is the exact shape that aborts on device — an empty fragment followed by a real one.
  it('commits only the non-empty sibling', () => {
    const surface = createSurface(1);
    const text = paragraph();
    appendChild(text, createRawText(''));
    appendChild(text, createRawText(' trailing'));
    surface.appendChild(text);
    surface.commit();

    expect(committedTexts()).toEqual([' trailing']);
    expect(committedShape()).toBe('RootView(View(Paragraph(RawText())))');
  });

  // why: a whitespace-only string is REAL content in a <Text> ("a" + " " + "b" reads as "a b"), so
  // the rule is "empty", never "blank" — this is what stops the fix from over-reaching.
  it('keeps a whitespace-only sibling, which is real text', () => {
    const surface = createSurface(1);
    const text = paragraph();
    appendChild(text, createRawText('a'));
    appendChild(text, createRawText(' '));
    appendChild(text, createRawText('b'));
    surface.appendChild(text);
    surface.commit();

    expect(committedTexts()).toEqual(['a', ' ', 'b']);
  });

  // why: emptying a text is a normal reactive update, not a teardown — the node has to come back in
  // its original position the moment it has content again.
  it('re-admits the node once it has text again', () => {
    const surface = createSurface(1);
    const text = paragraph();
    const first = createRawText('hello');
    appendChild(text, first);
    appendChild(text, createRawText(' world'));
    surface.appendChild(text);
    surface.commit();
    expect(committedTexts()).toEqual(['hello', ' world']);

    setText(first, '');
    surface.commit();
    expect(committedTexts()).toEqual([' world']);

    setText(first, 'hi');
    surface.commit();
    expect(committedTexts()).toEqual(['hi', ' world']);
  });
});

report();
