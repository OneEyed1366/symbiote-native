// ShimAnimation's contract, isolated from a real mount: `new ShimElement(...)` with no engine
// node takes the same "nothing to animate" path a real element with 0-length keyframes/duration
// takes, so it exercises the fix below without a live Fabric tree.

import { describe, expect, it } from 'vitest';
import { ShimElement } from './element';
import { animateShimElement } from './animation';
import { setShimAnimationsEnabled } from './animations-gate';

setShimAnimationsEnabled(true);

describe('ShimAnimation.cancel()', () => {
  // why: Svelte's transition machinery cancels the outgoing animation the same tick it starts a
  // new one on rapid toggle; a handler firing for a transition that never played would run the
  // caller's finish-cleanup (e.g. removing the element) against a transition that was superseded.
  it('suppresses a still-pending onfinish once cancelled in the same tick', async () => {
    const element = new ShimElement('view');
    const animation = animateShimElement(element, [{ opacity: '1' }], 200);

    let finished = false;
    animation.onfinish = () => {
      finished = true;
    };
    animation.cancel();

    await Promise.resolve();
    await Promise.resolve();

    expect(finished).toBe(false);
  });

  it('reports idle, not the stale running state, after cancelling', () => {
    const element = new ShimElement('view');
    const animation = animateShimElement(element, [{ opacity: '1' }], 200);

    animation.cancel();

    expect(animation.playState).toBe('idle');
  });
});
