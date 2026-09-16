// `<Text>` inside `<Text>` is a different native view, and this is where that is settled.
//
// The rule is one of the project's load-bearing invariants (root CLAUDE.md, Primitives): a text
// element under a text element commits as `RCTVirtualText` rather than `RCTText`, no adapter
// implements it, and the engine decides it when a node acquires a parent. Until now it was checked
// against a TypeScript tree that had been told the same rule — two statements of one belief, which
// tests neither.
//
// **The rule lives in the SHADOW tree and is invisible on the platform.** A paragraph's contents
// are an attributed string, not views: `RCTVirtualText` and `RCTRawText` are virtual nodes, the
// differ never emits a mutation for them, and a mounted `<Text>` holding a whole sentence is ONE
// view with no children. The first version of this file asserted the nesting against the mounted
// tree and every case came back `Paragraph()`. So text shape is read from `committedShape()`, and
// `mounted()` is used for the claim that only the paragraph itself is a view.
//
// Fabric's own names: `Paragraph` is `RCTText`, `Text` is `RCTVirtualText`, `RawText` is
// `RCTRawText` (`componentNameByReactViewName`).

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  setProp,
} from '@symbiote-native/engine';

import {
  committedShape,
  describe,
  expect,
  it,
  mounted,
  report,
  shapeOf,
} from './harness';

function text(testID: string) {
  const node = createElement('RCTText', true);
  setProp(node, 'testID', testID);
  return node;
}

describe('text nesting decides the native view name', () => {
  // why: the baseline. A lone text element is a paragraph and its characters are a raw text under
  // it — if this shape is wrong, nothing below means anything.
  it('a lone text element commits as a paragraph holding its characters', () => {
    const surface = createSurface(1);
    const paragraph = text('lead');
    appendChild(paragraph, createRawText('hello'));
    surface.appendChild(paragraph);
    surface.commit();

    expect(committedShape()).toBe('RootView(View(Paragraph(RawText())))');
  });

  // why: THE rule. The inner element is the same authored component as the outer one and has to
  // arrive under a different native name.
  it('a text element under a text element commits as virtual text', () => {
    const surface = createSurface(1);
    const outer = text('outer');
    const inner = text('inner');
    appendChild(inner, createRawText('world'));
    appendChild(outer, inner);
    surface.appendChild(outer);
    surface.commit();

    expect(committedShape()).toBe('RootView(View(Paragraph(Text(RawText()))))');
  });

  // why: the rule is STICKY through a non-text element. A `<View>` in the middle does not end the
  // text context, so the text below it is still virtual — the case an adapter would get wrong if it
  // tried to decide this from its own parent chain.
  it('stays virtual through a view in the middle', () => {
    const surface = createSurface(1);
    const outer = text('outer');
    const middle = createElement('RCTView');
    setProp(middle, 'testID', 'middle');
    const inner = text('inner');
    appendChild(inner, createRawText('deep'));
    appendChild(middle, inner);
    appendChild(outer, middle);
    surface.appendChild(outer);
    surface.commit();

    expect(committedShape()).toBe(
      'RootView(View(Paragraph(View(Text(RawText())))))',
    );
  });

  // why: and none of that nesting is a native view. A sentence is one paragraph view whatever it is
  // made of — which is why a test may not read text structure off the mounted tree.
  it('mounts one view for the paragraph, whatever it contains', () => {
    const surface = createSurface(1);
    const outer = text('outer');
    const inner = text('inner');
    appendChild(inner, createRawText('world'));
    appendChild(outer, inner);
    surface.appendChild(outer);
    surface.commit();

    expect(shapeOf(mounted())).toBe('RootView(Paragraph())');
  });

  // why: an empty raw text must not reach Fabric at all — `AttributedString::appendFragment` drops
  // an empty fragment while the text walk has already recorded "the last child was raw text", so
  // the next raw sibling merges into an empty vector and the process aborts. `node.ts` says this in
  // a comment; here the committed tree says it.
  it('skips an empty raw text', () => {
    const surface = createSurface(1);
    const paragraph = text('p');
    appendChild(paragraph, createRawText(''));
    surface.appendChild(paragraph);
    surface.commit();

    expect(committedShape()).toBe('RootView(View(Paragraph()))');
  });
});

report();
