// The pressed look is a style variant the compiler supplies for `style={({pressed}) => ...}`
// Specialising that arrow at both values of `pressed` gives two plain objects, which live here
// The variant replaces slot 1 (the explicit style), т.к. it stands in for the authored `style`
import { afterEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  clearGlobalStyles,
  createElement,
  createSurface,
  propOf,
  registerRules,
  routeProp,
  setNodePressed,
  type ISymbioteNode,
} from '../index';

const fabric = installRecordingFabric();
// The payload is what ships; the author's bag is not. Every read below is `.payload`.
const live = createLiveTree(fabric);
let nextRootTag = 7_500;

function mount(node: ISymbioteNode) {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return surface;
}

// The published `[classStyle, explicitStyle]` pair, read back out of the tree HOST — the engine
// holds no props, and slot identity is what the no-variant case asserts on.
function slots(node: ISymbioteNode): unknown[] {
  const style = propOf(node, 'style');
  return Array.isArray(style) ? style : [];
}

afterEach(() => {
  clearGlobalStyles();
});

describe('compiler-supplied pressed style variant', () => {
  it('swaps the EXPLICIT slot while pressed and restores it on release', () => {
    const node = createElement('RCTView');
    routeProp(node, 'style', { opacity: 1, borderColor: 'red' });
    routeProp(node, 'activeStyle', { opacity: 0.6, borderColor: 'red' });
    mount(node);

    expect(slots(node)[1]).toEqual({ opacity: 1, borderColor: 'red' });

    setNodePressed(node, true);
    expect(slots(node)[1]).toEqual({ opacity: 0.6, borderColor: 'red' });

    setNodePressed(node, false);
    expect(slots(node)[1]).toEqual({ opacity: 1, borderColor: 'red' });
  });

  // Slot 0 is the class cascade's job and slot 1 the author's, so the variant leaves slot 0 alone
  it('keeps the class style of slot 0 while the explicit slot swaps', () => {
    registerRules([
      {
        tokens: ['btn'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 4 },
      },
    ]);
    const node = createElement('RCTView');
    routeProp(node, 'class', 'btn');
    routeProp(node, 'style', { opacity: 1 });
    routeProp(node, 'activeStyle', { opacity: 0.6 });
    mount(node);

    setNodePressed(node, true);
    expect(slots(node)[0]).toEqual({ padding: 4 });
    expect(slots(node)[1]).toEqual({ opacity: 0.6 });
  });

  // A node with no variant must be byte-identical to one that never heard of the feature — the
  // same identity discipline `isAlreadyPublished` rests on.
  it('publishes the IDENTICAL explicit object when no variant was supplied', () => {
    const node = createElement('RCTView');
    const authored = { opacity: 1 };
    routeProp(node, 'style', authored);
    mount(node);
    const before = slots(node)[1];

    setNodePressed(node, true);

    expect(slots(node)[1]).toBe(before);
  });

  // `activeStyle` is OURS, not a Fabric prop. If it leaks into the payload the native side sees an
  // unknown key on every pressable in the app.
  it('never reaches the committed payload', () => {
    const node = createElement('RCTView');
    routeProp(node, 'activeStyle', { opacity: 0.6 });
    mount(node);

    expect('activeStyle' in live.nodeOf(node).payload).toBe(false);
  });
});
