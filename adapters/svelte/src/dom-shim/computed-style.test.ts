// why: svelte's flip() destructures transformOrigin into [ox, oy] and divides both by the
// element's own box - a single-token default (`DEFAULTS`' generic `'0px'`) leaves oy undefined,
// which reads as NaN. The real DOM default is the box center (`50% 50%`), two tokens.

import { describe, expect, it } from 'vitest';
import { ShimElement } from './element';
import { computedStyleOf } from './computed-style';

describe('computedStyleOf', () => {
  it("defaults transformOrigin to the element's own center, not a single zero token", () => {
    const element = new ShimElement('view');
    element.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 64,
      height: 40,
      top: 0,
      left: 0,
      right: 64,
      bottom: 40,
    });

    expect(computedStyleOf(element).transformOrigin).toBe('32px 20px');
  });
});
