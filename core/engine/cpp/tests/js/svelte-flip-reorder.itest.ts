// Reproduces `TransitionAnimateDemo`'s Shuffle headless, through the real adapter, not the
// raw engine mutation API `same-parent-reorder.itest.ts` already cleared

import { mount, unmount } from '@symbiote-native/svelte';
import { setShimAnimationsEnabled } from '../../../../../adapters/svelte/src/dom-shim/animations-gate';

import {
  describe,
  expect,
  findAllCommitted,
  flushTimers,
  it,
  report,
} from './harness';
import { flipItemsSetter } from './svelte-flip-reorder-bridge';

import Probe from './svelte-flip-reorder-probe.svelte';

const ROOT_TAG = 1;

setShimAnimationsEnabled(true);

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

function order(): string[] {
  return findAllCommitted(one => one.props.testID !== undefined).map(
    one => one.props.testID,
  );
}

describe('Svelte adapter, animate:flip reorder on the real engine', () => {
  it('commits the swapped order after a keyed reorder settles', async () => {
    const surface = mount(ROOT_TAG, Probe);
    await tick();
    surface.commit();
    expect(order()).toEqual(['a', 'b', 'c', 'd']);

    flipItemsSetter()(['a', 'c', 'b', 'd']);
    await tick();
    surface.commit();

    expect(order()).toEqual(['a', 'c', 'b', 'd']);
    unmount(ROOT_TAG);
  });
});

report();
