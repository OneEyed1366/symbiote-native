// A handful of events are gated behind a boolean prop (`layout` -> `onLayout`), so installing or
// dropping one of those listeners also writes that flag

// Dropping a listener the node never had writes the flag anyway, т.к. `recordSetProp` has no
// identity guard. Priced and KEPT: skipping it saves 1 KB per item on the two anchor-backed
// touchables and costs 10 ms on their teardown (symbiote-perf-measurement §24)

import { describe, expect, it } from 'vitest';

import {
  OP_SET_PROP,
  OP_STRIDE,
  resetMutationBuffer,
  takeBatch,
} from './mutation-buffer';
import { createElement, setBehaviorListener } from './node';

function propWritesOf(): number {
  const { ops } = takeBatch();
  let writes = 0;
  for (let at = 0; at < ops.length; at += OP_STRIDE) {
    if (ops[at] === OP_SET_PROP) writes += 1;
  }
  return writes;
}

describe('a gated listener flag', () => {
  it('writes the flag on, then off, around a listener that was installed', () => {
    resetMutationBuffer();
    const node = createElement('RCTView');
    takeBatch();

    setBehaviorListener(node, 'layout', () => undefined);
    expect(propWritesOf()).toBe(1);

    setBehaviorListener(node, 'layout', undefined);
    expect(propWritesOf()).toBe(1);
  });

  // The write the §24 measurement decided to keep: `touchable-without-feedback` re-forwards four
  // names on every child insert, and the two gated ones clear a key the child never carried
  it('still writes the clear for a listener that was never installed', () => {
    resetMutationBuffer();
    const node = createElement('RCTView');
    takeBatch();

    setBehaviorListener(node, 'layout', undefined);

    expect(propWritesOf()).toBe(1);
  });

  it('leaves an ungated listener writing no prop at all', () => {
    resetMutationBuffer();
    const node = createElement('RCTView');
    takeBatch();

    setBehaviorListener(node, 'pressIn', () => undefined);

    expect(propWritesOf()).toBe(0);
  });
});
