// A binding held on a node deep in a screen is let go when the screen leaves, on the real engine

import {
  appendChild,
  bindToNode,
  createElement,
  createSurface,
} from '@symbiote-native/engine';

import { describe, expect, it, print, report } from './harness';

const ROOT_TAG = 1;

describe('a node binding on the real engine', () => {
  it('is let go when the screen above its node leaves the tree', () => {
    let attached = 0;
    let released = 0;
    const surface = createSurface(ROOT_TAG);
    const screen = createElement('view');
    const inner = createElement('view');
    const row = createElement('view');
    appendChild(screen, inner);
    appendChild(inner, row);
    surface.appendChild(screen);
    surface.commit();
    bindToNode(row, () => {
      attached += 1;
      return () => {
        released += 1;
      };
    });

    const attachedBefore = attached;
    surface.removeChild(screen);
    surface.commit();
    print(`binding: attached ${attachedBefore}, released ${released}`);

    expect(attachedBefore).toBe(1);
    expect(released).toBe(1);
    surface.teardown();
  });
});

report();
