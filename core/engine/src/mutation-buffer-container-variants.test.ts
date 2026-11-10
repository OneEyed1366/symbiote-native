// A consumer's container variants cross to native as one op naming the slot and one interned JSON

import { beforeEach, describe, expect, it } from 'vitest';
import {
  NO_VALUE,
  OP_SET_CONTAINER_VARIANTS,
  recordCreateElement,
  recordSetContainerVariants,
  resetMutationBuffer,
  takeBatch,
} from './mutation-buffer';

const ENVELOPE = '[[true],[1,{"padding":16}]]';

function recordOn(envelope: string | undefined): ReturnType<typeof takeBatch> {
  const handle = {};
  recordCreateElement(handle, 'RCTView', false, undefined);
  recordSetContainerVariants(handle, envelope);
  return takeBatch();
}

beforeEach(() => {
  resetMutationBuffer();
});

describe('container variants op', () => {
  it('writes the slot and the interned envelope', () => {
    const { ops, strings } = recordOn(ENVELOPE);

    const at = ops.indexOf(OP_SET_CONTAINER_VARIANTS);
    expect(ops[at + 1]).toBe(ops[1]);
    expect(strings[ops[at + 2] ?? -1]).toBe(ENVELOPE);
  });

  it('marks a clear with NO_VALUE in place of the envelope', () => {
    const { ops } = recordOn(undefined);

    expect(ops[ops.indexOf(OP_SET_CONTAINER_VARIANTS) + 2]).toBe(NO_VALUE);
  });

  it('takes a slot of its own in the op numbering', () => {
    expect(OP_SET_CONTAINER_VARIANTS).toBe(17);
  });
});
