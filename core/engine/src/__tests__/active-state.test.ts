// What a press leaves alone: the class style of slot 0 stays the very same object, т.к.
// `isAlreadyPublished` compares with Object.is and an equal-but-fresh object would dirty a node
// The pressed look itself is a style variant of slot 1 (`active-style-variant.test.ts`)
import { afterEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
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

// A RECORDING host: nothing here reads a committed tree.
installRecordingFabric();
let nextRootTag = 7_000;

function mount(node: ISymbioteNode) {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return surface;
}

// The array `pushClassStyle` last published, read back out of the tree HOST, so slot identity is
// the stored value rather than a rebuild of it
function publishedStyle(node: ISymbioteNode): unknown[] {
  const style = propOf(node, 'style');
  return Array.isArray(style) ? style : [];
}

const BASE_RULE = {
  tokens: ['btn'],
  specificity: [0, 1, 0] as const,
  order: 0,
  style: { opacity: 1 },
};

afterEach(() => {
  clearGlobalStyles();
});

describe('setNodePressed', () => {
  it('publishes the IDENTICAL class style object while pressed', () => {
    registerRules([BASE_RULE]);
    const node = createElement('RCTView');
    routeProp(node, 'class', 'btn');
    mount(node);
    const before = publishedStyle(node)[0];

    setNodePressed(node, true);

    expect(publishedStyle(node)[0]).toBe(before);
    expect(publishedStyle(node)).toHaveLength(2);
  });

  // An all-string array is joined into one string, so it takes the memoised path and the identity
  // check works for it too. A mixed array must NOT convert: its objects are styles, not tokens
  it('republishes an identical base for an unchanged array class', () => {
    registerRules([BASE_RULE]);
    const node = createElement('RCTView');
    routeProp(node, 'class', ['btn', 'wide']);
    mount(node);
    const before = publishedStyle(node)[0];

    // A fresh array with the same tokens, what a re-render hands over every time
    routeProp(node, 'class', ['btn', 'wide']);

    expect(publishedStyle(node)[0]).toBe(before);
  });

  it('leaves a MIXED array alone, its object entries are styles, not tokens', () => {
    const node = createElement('RCTView');
    routeProp(node, 'class', ['btn', { margin: 4 }]);
    mount(node);

    expect(publishedStyle(node)[0]).toMatchObject({ margin: 4 });
  });
});
