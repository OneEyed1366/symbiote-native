// The SECOND way to deliver a pressed look, beside a `:active` CSS rule: a style variant the
// COMPILER supplies. A functional `style={({pressed}) => …}` is the shape every framework's
// community writes and it currently forces the primitive to stay a component, because the template
// reads the press state. Specialising that arrow at both values of `pressed` turns it into two
// plain objects, which need somewhere to live — here.
//
// It replaces slot 1 (the EXPLICIT style), not slot 0: an authored `style` is what it stands in
// for, so it must beat the class cascade exactly the way the authored style does.
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
let nextRootTag = 7500;

function mount(node: ISymbioteNode) {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return surface;
}

function slots(node: ISymbioteNode): unknown[] {
  const style = node.props.style;
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

  // The two mechanisms have to compose, because an app can use both — a class for the shared look
  // and a compiled ternary for the per-instance half. Slot 0 is the class cascade's job and slot 1
  // the author's; neither variant may reach across.
  it('composes with a :active class rule without either reaching into the other slot', () => {
    registerRules([
      {
        tokens: ['btn'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 4 },
      },
      {
        tokens: ['btn', ':active'],
        specificity: [0, 2, 0],
        order: 1,
        style: { padding: 8 },
      },
    ]);
    const node = createElement('RCTView');
    routeProp(node, 'class', 'btn');
    routeProp(node, 'style', { opacity: 1 });
    routeProp(node, 'activeStyle', { opacity: 0.6 });
    mount(node);

    setNodePressed(node, true);
    expect(slots(node)[0]).toEqual({ padding: 8 });
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

    expect('activeStyle' in node.props).toBe(false);
  });
});
