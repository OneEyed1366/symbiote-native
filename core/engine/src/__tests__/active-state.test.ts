// `:active` resolved BELOW the framework — the engine-owned half of what the browser gives free,
// and the precondition for a pressable being an intrinsic tag rather than a component
// (`.claude/rules/host-primitive-tier.md`, tier 2).
//
// Two properties carry the design and both are easy to lose silently. The pressed variant is a
// full REPLACEMENT for slot 0, so the published array never changes shape; and it must be the very
// SAME object as the unpressed style when no `:active` rule exists, because `isAlreadyPublished`
// compares with Object.is and an equal-but-fresh object would dirty a node for nothing.
import { afterEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  clearGlobalStyles,
  createElement,
  createSurface,
  registerRules,
  routeProp,
  setNodePressed,
  type ISymbioteNode,
} from '../index';

installFabric();
let nextRootTag = 7000;

function mount(node: ISymbioteNode) {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return surface;
}

function publishedStyle(node: ISymbioteNode): unknown[] {
  const style = node.props.style;
  return Array.isArray(style) ? style : [];
}

afterEach(() => {
  clearGlobalStyles();
});

describe('setNodePressed', () => {
  it('swaps slot 0 for the :active cascade and back, keeping the array shape', () => {
    registerRules([
      {
        tokens: ['btn'],
        specificity: [0, 1, 0],
        order: 0,
        style: { opacity: 1 },
      },
      {
        tokens: ['btn', ':active'],
        specificity: [0, 2, 0],
        order: 1,
        style: { opacity: 0.6 },
      },
    ]);
    const node = createElement('RCTView');
    routeProp(node, 'class', 'btn');
    mount(node);

    expect(publishedStyle(node)[0]).toEqual({ opacity: 1 });
    expect(publishedStyle(node)).toHaveLength(2);

    setNodePressed(node, true);
    // The variant carries the WHOLE cascade, not just the pressed rule's declarations — which is
    // why it replaces slot 0 instead of being appended as a fourth part.
    expect(publishedStyle(node)[0]).toEqual({ opacity: 0.6 });
    expect(publishedStyle(node), 'shape is unchanged').toHaveLength(2);

    setNodePressed(node, false);
    expect(publishedStyle(node)[0]).toEqual({ opacity: 1 });
  });

  it('leaves the explicit style winning over the pressed class style', () => {
    registerRules([
      {
        tokens: ['btn', ':active'],
        specificity: [0, 2, 0],
        order: 0,
        style: { opacity: 0.6 },
      },
    ]);
    const node = createElement('RCTView');
    routeProp(node, 'class', 'btn');
    routeProp(node, 'style', { opacity: 0.2 });
    mount(node);

    setNodePressed(node, true);
    expect(publishedStyle(node)[1], 'slot 1 is untouched').toEqual({
      opacity: 0.2,
    });
  });

  // The property Solid's re-push storm made load-bearing: an app with no `:active` rule must pay
  // NOTHING for a press. Two cache keys give two objects even when the contents match byte for
  // byte, and Object.is cannot reconcile them — so without the registry-level check a press would
  // publish a fresh base and dirty the node for a payload Fabric then rejects as unchanged.
  it('publishes the IDENTICAL object when no :active rule exists anywhere', () => {
    registerRules([
      {
        tokens: ['btn'],
        specificity: [0, 1, 0],
        order: 0,
        style: { opacity: 1 },
      },
    ]);
    const node = createElement('RCTView');
    routeProp(node, 'class', 'btn');
    mount(node);
    const before = publishedStyle(node)[0];

    setNodePressed(node, true);

    expect(publishedStyle(node)[0]).toBe(before);
  });

  // An all-string array used to opt out of everything identity-keyed: no pressed variant, and no
  // isAlreadyPublished either, so a row re-dirtied on every update. A MIXED array must NOT convert
  // — its object entries are resolved styles passed through the class channel, not tokens.
  it('gives an all-string array the same pressed styling as the joined string', () => {
    registerRules([
      {
        tokens: ['btn'],
        specificity: [0, 1, 0],
        order: 0,
        style: { opacity: 1 },
      },
      {
        tokens: ['btn', ':active'],
        specificity: [0, 2, 0],
        order: 1,
        style: { opacity: 0.6 },
      },
    ]);
    const node = createElement('RCTView');
    routeProp(node, 'class', ['btn', 'wide']);
    mount(node);

    setNodePressed(node, true);
    expect(publishedStyle(node)[0]).toEqual({ opacity: 0.6 });
  });

  it('republishes an identical base for an unchanged array class', () => {
    registerRules([
      {
        tokens: ['btn'],
        specificity: [0, 1, 0],
        order: 0,
        style: { opacity: 1 },
      },
    ]);
    const node = createElement('RCTView');
    routeProp(node, 'class', ['btn', 'wide']);
    mount(node);
    const before = publishedStyle(node)[0];

    // A fresh array with the same tokens — what a re-render hands over every time.
    routeProp(node, 'class', ['btn', 'wide']);

    expect(publishedStyle(node)[0]).toBe(before);
  });

  it('leaves a MIXED array alone — its object entries are styles, not tokens', () => {
    registerRules([
      {
        tokens: ['btn', ':active'],
        specificity: [0, 2, 0],
        order: 0,
        style: { opacity: 0.6 },
      },
    ]);
    const node = createElement('RCTView');
    routeProp(node, 'class', ['btn', { margin: 4 }]);
    mount(node);

    expect(publishedStyle(node)[0]).toMatchObject({ margin: 4 });
  });

  it('keeps the hidden slot appended and last while pressed', () => {
    registerRules([
      {
        tokens: ['btn', ':active'],
        specificity: [0, 2, 0],
        order: 0,
        style: { opacity: 0.6 },
      },
    ]);
    const node = createElement('RCTView');
    routeProp(node, 'class', 'btn');
    mount(node);

    setNodePressed(node, true);
    expect(publishedStyle(node)).toHaveLength(2);
  });
});
