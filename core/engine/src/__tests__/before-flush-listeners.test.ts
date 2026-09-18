// `registerBeforeFlush` — the last moment an adapter holding a coalesced write can record it.
//
// An adapter cannot always publish a write the instant its framework hands it over. Angular's
// styling engine has no whole-value call, so the renderer accumulates `setStyle` key by key and
// writes RN's one `style` prop once. The accumulator must be emptied before anything can OBSERVE
// the tree, and the adapter cannot know when that is — a read and a commit both arrive from
// elsewhere. Both come through `flushOps`, which is what makes it the seam.
//
// THE CASE THAT MATTERS IS THE COMMIT, and it is the one a careless implementation misses: a turn
// whose last act is a style change has no next renderer call to close the run, so if the commit does
// not close it the node paints without its style and the write surfaces in some later turn. That was
// observed on the bench arm before this file existed — `select` reported `setProps=0` and the write
// turned up two steps later.

import { beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createElement,
  createSurface,
  parentOf,
  registerBeforeFlush,
  setProp,
  type ISymbioteNode,
} from '../index';

const ROOT_TAG = 71;
const fabric = installRecordingFabric();

let release: (() => void) | undefined;

beforeEach(() => {
  fabric.reset();
  release?.();
  release = undefined;
});

describe('a before-flush listener', () => {
  // why: THE COMMIT CASE. Nothing else in a turn has to happen for a commit to, so this is the only
  // guarantee an adapter can build on.
  it('runs before a commit drains, and its write rides that commit', () => {
    const surface = createSurface(ROOT_TAG);
    const node: ISymbioteNode = createElement('RCTView');
    surface.appendChild(node);

    let ran = 0;
    release = registerBeforeFlush(() => {
      ran += 1;
      setProp(node, 'testID', 'written-by-the-listener');
    });

    surface.commit();

    expect(ran, 'the commit asked').toBeGreaterThan(0);
    const created = fabric.find(one => one.handle === node);
    expect(
      created?.props.testID,
      'and what it wrote was in the same commit',
    ).toBe('written-by-the-listener');
  });

  // why: a READ is the other observer. An adapter holding a write must not be able to answer a
  // question about a tree that does not yet contain it.
  it('runs before a read drains', () => {
    const surface = createSurface(ROOT_TAG);
    const node: ISymbioteNode = createElement('RCTView');
    surface.appendChild(node);
    surface.commit();

    let ran = 0;
    release = registerBeforeFlush(() => {
      ran += 1;
    });

    parentOf(node);

    expect(ran).toBeGreaterThan(0);
  });

  // why: THE EMPTY-BUFFER CASE, and it is why the listener runs BEFORE the `hasPendingOps` check
  // rather than after. An adapter holding a write has ops that are not in the buffer yet, so an
  // empty buffer is the exact state in which it most needs asking.
  it('runs even when the buffer has nothing in it', () => {
    const surface = createSurface(ROOT_TAG);
    const node: ISymbioteNode = createElement('RCTView');
    surface.appendChild(node);
    surface.commit();
    // Drains whatever the commit left, so the next read finds the buffer genuinely empty.
    parentOf(node);

    let ran = 0;
    release = registerBeforeFlush(() => {
      ran += 1;
    });

    parentOf(node);

    expect(ran).toBe(1);
  });

  // why: a listener records ops, and `routeProp` can reach a read on the way — which would re-enter
  // the flush and ask the same listener for what it has already handed over. An adapter written to
  // the contract "you are asked once per drain" would double-publish.
  it('is not re-entered by a read its own write performs', () => {
    const surface = createSurface(ROOT_TAG);
    const node: ISymbioteNode = createElement('RCTView');
    surface.appendChild(node);
    surface.commit();

    let ran = 0;
    release = registerBeforeFlush(() => {
      ran += 1;
      // The shape that re-enters: publishing, then asking the tree about what was published.
      setProp(node, 'testID', `pass-${ran}`);
      parentOf(node);
    });

    surface.commit();

    expect(ran).toBe(1);
  });

  // why: the registration returns its own removal, so an adapter that is torn down stops being
  // asked — a listener left behind reaches a renderer whose surface is gone.
  it('stops being asked once released', () => {
    const surface = createSurface(ROOT_TAG);
    const node: ISymbioteNode = createElement('RCTView');
    surface.appendChild(node);

    let ran = 0;
    const stop = registerBeforeFlush(() => {
      ran += 1;
    });
    surface.commit();
    const whileRegistered = ran;
    stop();

    setProp(node, 'testID', 'after');
    surface.commit();

    expect(whileRegistered).toBeGreaterThan(0);
    expect(ran, 'no further asks').toBe(whileRegistered);
  });
});
