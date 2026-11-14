// A container is declared through ordinary style keys, which the engine must carry through a commit
// The keys are for the JS side to read, so Fabric gets the layout props and the layout flag only

import {
  clearGlobalStyles,
  committedPayloadOf,
  createElement,
  createSurface,
  registerRules,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

function mount(root: ISymbioteNode): void {
  const surface = createSurface(ROOT_TAG);
  surface.appendChild(root);
  surface.commit();
  mounted();
}

describe('a container node on the real engine', () => {
  it('commits its layout props and asks for the layout event', () => {
    clearGlobalStyles();
    registerRules(
      [{ tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: 16 }, cond: 0 }],
      [['@', null, ['>=', 'width', 400]]],
    );
    const container = createElement('RCTView', false);
    routeProp(container, 'style', { width: 320, containerType: 'size', containerName: 'card' });
    mount(container);

    const payload = committedPayloadOf(container);
    expect(payload?.width).toBe(320);
    expect(payload?.onLayout).toBe(true);
  });

  it('leaves a node that is no container without the layout flag', () => {
    clearGlobalStyles();
    const plain = createElement('RCTView', false);
    routeProp(plain, 'style', { width: 320 });
    mount(plain);

    expect(committedPayloadOf(plain)?.onLayout).toBe(undefined);
  });
});

report();
