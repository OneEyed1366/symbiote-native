// why: svelte's real flip() reads node.parentElement/clientWidth/clientHeight - none existed on
// ShimElement, so get_zoom()'s ancestor walk hit `undefined.parentElement` and threw, aborting
// the each-block's reorder before it ever moved a tile (not "no animation" - no reorder at all).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flip } from 'svelte/animate';
import { ShimElement } from './element';
import { patchGlobals, restoreGlobals } from './patch-globals';

beforeEach(patchGlobals);
afterEach(restoreGlobals);

// flip() is typed against the real DOM's Element; the shim is a structural stand-in, never a
// subtype of it, so calling it here is the same I/O-edge cast every adapter->engine call makes.
function asElement(node: ShimElement): Element {
  return node as unknown as Element;
}

function rect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    top: 0,
    left: 0,
    right: 64,
    bottom: 64,
    toJSON: () => ({}),
    ...overrides,
  } as DOMRect;
}

describe('svelte/animate flip against the DOM shim', () => {
  // why: svelte's get_zoom() walks node.parentElement until it hits null, exactly like a real
  // Element chain terminating at documentElement.parentElement === null.
  it('walks parentElement up to the root without throwing', () => {
    const root = new ShimElement('view');
    const tile = new ShimElement('view');
    root.appendChild(tile);

    expect(() =>
      flip(
        asElement(tile),
        { from: rect(), to: rect({ left: 100 }) },
        { duration: 260 },
      ),
    ).not.toThrow();
  });

  it('a root tile with no parent at all does not throw either', () => {
    const tile = new ShimElement('view');

    expect(() =>
      flip(
        asElement(tile),
        { from: rect(), to: rect({ left: 100 }) },
        { duration: 260 },
      ),
    ).not.toThrow();
  });
});
