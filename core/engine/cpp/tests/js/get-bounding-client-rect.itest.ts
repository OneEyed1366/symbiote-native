// Does it answer with the tree's REAL layout, or the zero rect that broke Svelte's animate:flip
// (from.left/top never differ, so its FLIP guard never fires)? A spacer above the probe is what
// makes this honest - a probe alone at the origin would read x=0, y=0 even off a stub.

import {
  appendChild,
  createElement,
  createSurface,
  getBoundingClientRect,
  setProp,
} from '@symbiote-native/engine';

import { describe, expect, it, print, report } from './harness';

describe('getBoundingClientRect against a real committed layout', () => {
  it('returns undefined for a node that was never committed, instead of throwing', () => {
    const probe = createElement('RCTView');
    setProp(probe, 'style', { width: 10, height: 10 });

    expect(getBoundingClientRect(probe, false)).toBe(undefined);
  });

  it("reports the probe view's actual position and size, not a zero rect", () => {
    const surface = createSurface(1);
    const container = createElement('RCTView');
    const spacer = createElement('RCTView');
    setProp(spacer, 'style', { width: 10, height: 40 });
    const probe = createElement('RCTView');
    setProp(probe, 'style', { width: 100, height: 80 });
    appendChild(container, spacer);
    appendChild(container, probe);
    surface.appendChild(container);
    surface.commit();

    const rect = getBoundingClientRect(probe, false);
    print(`DEBUG rect = ${JSON.stringify(rect)}`);

    if (rect === undefined)
      throw new Error('getBoundingClientRect returned undefined');
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(80);
    // The spacer's height, not zero - proves this is Yoga's real stacked position.
    expect(rect.y).toBe(40);
  });
});

report();
