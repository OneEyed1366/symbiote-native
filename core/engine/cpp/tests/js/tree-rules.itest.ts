// The tree rules, driven from the engine's own JS and read off React Native's own trees.
//
// These are the rules `core/test-utils/src/tree-applier.ts` re-implements in TypeScript so that
// vitest has something to commit into. `tree-through-jsi.cpp` already checks them from C++; this
// file checks them from the side the adapters are on, which is the side that has to be right for
// the app. Between the two there is no longer a place for a third implementation.

import {
  appendChild,
  createAnchor,
  createElement,
  createSurface,
  createVoid,
  insertBefore,
  removeChild,
  setNodeComponent,
  setProp,
} from '@symbiote-native/engine';

import { committedShape, describe, expect, it, report } from './harness';

function view(testID: string) {
  const node = createElement('RCTView');
  setProp(node, 'testID', testID);
  return node;
}

describe('the tree rules, through the engine', () => {
  // why: an anchor is a framework's bookkeeping node — Svelte's `{#if}`, Vue's fragment — with no
  // native twin. It has to contribute its CHILDREN in its own place: not itself, or an empty box
  // appears, and not nothing, or everything inside a conditional block vanishes.
  it('an anchor hands its children up in its own place', () => {
    const surface = createSurface(1);
    const before = view('before');
    const anchor = createAnchor();
    const after = view('after');
    appendChild(anchor, view('inside-one'));
    appendChild(anchor, view('inside-two'));
    surface.appendChild(before);
    surface.appendChild(anchor);
    surface.appendChild(after);
    surface.commit();

    expect(committedShape()).toBe('RootView(View(View()View()View()View()))');
  });

  // why: `InputAccessoryView` renders `null` on Android (`InputAccessoryView.js`) — the WHOLE
  // component, children included, contributes nothing. Unlike an anchor, a void node must not hoist
  // its children either, or the toolbar content an app wrapped in it would still paint, just
  // unparented from the accessory view.
  it('a void node contributes neither itself nor its children', () => {
    const surface = createSurface(1);
    const before = view('before');
    const voidNode = createVoid();
    const after = view('after');
    appendChild(voidNode, view('inside-one'));
    appendChild(voidNode, view('inside-two'));
    surface.appendChild(before);
    surface.appendChild(voidNode);
    surface.appendChild(after);
    surface.commit();

    expect(committedShape()).toBe('RootView(View(View()View()))');
  });

  // why: `insertBefore` has to land at the named position. A list that inserts at the head is the
  // case that catches a child set which can only append.
  it('insertBefore lands at the named position', () => {
    const surface = createSurface(1);
    const container = view('container');
    const first = view('first');
    const last = createElement('RCTScrollView');
    setProp(last, 'testID', 'last');
    appendChild(container, first);
    appendChild(container, last);
    surface.appendChild(container);
    surface.commit();

    const inserted = createElement('RCTText', true);
    setProp(inserted, 'testID', 'inserted');
    insertBefore(container, inserted, last);
    surface.commit();

    expect(committedShape()).toBe(
      'RootView(View(View(View()Paragraph()ScrollView())))',
    );
  });

  // why: a move is the one mutation where the node itself did not change and the tree did. Fabric
  // answers a child reusing a family it no longer belongs to with an abort inside
  // `ShadowNodeFamily::setParent` — a device crash invisible to a stand-in because a
  // stand-in has no families.
  it('a moved child is rebuilt under its new parent', () => {
    const surface = createSurface(1);
    const left = view('left');
    const right = createElement('RCTScrollView');
    setProp(right, 'testID', 'right');
    const traveller = view('traveller');
    appendChild(left, traveller);
    surface.appendChild(left);
    surface.appendChild(right);
    surface.commit();

    removeChild(left, traveller);
    appendChild(right, traveller);
    surface.commit();

    expect(committedShape()).toBe('RootView(View(View()ScrollView(View())))');
  });

  // why: a parent that changes its component keeps its tag and its identity, so a child comparing
  // only "same parent object" reuses a family the new parent does not own. That is the other half
  // of the same device crash, and the reason the engine mints a fresh family by GENERATION.
  it('survives a parent that changes its component while holding a child', () => {
    const surface = createSurface(1);
    const parent = view('parent');
    appendChild(parent, view('child'));
    surface.appendChild(parent);
    surface.commit();

    setNodeComponent(parent, 'RCTScrollView');
    surface.commit();

    expect(committedShape()).toBe('RootView(View(ScrollView(View())))');
  });

  // why: removing the last child must leave the parent standing and empty, not take it with it.
  it('an emptied parent stays', () => {
    const surface = createSurface(1);
    const parent = view('parent');
    const only = view('only');
    appendChild(parent, only);
    surface.appendChild(parent);
    surface.commit();

    removeChild(parent, only);
    surface.commit();

    expect(committedShape()).toBe('RootView(View(View()))');
  });
});

report();
