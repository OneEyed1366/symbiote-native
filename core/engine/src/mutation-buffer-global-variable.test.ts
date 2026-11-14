// A `:root` variable crosses to native as one op carrying two interned strings

import { beforeEach, describe, expect, it } from 'vitest';
import {
  NO_VALUE,
  OP_SET_GLOBAL_VARIABLE,
  recordRemoveGlobalVariable,
  recordSetGlobalVariable,
  resetMutationBuffer,
  takeBatch,
} from './mutation-buffer';

beforeEach(() => {
  resetMutationBuffer();
});

describe('global variable ops', () => {
  it('writes the name and the value as table strings', () => {
    recordSetGlobalVariable('--gap', '8px');

    const { ops, strings } = takeBatch();
    expect(ops[0]).toBe(OP_SET_GLOBAL_VARIABLE);
    expect(strings[ops[1] ?? -1]).toBe('--gap');
    expect(strings[ops[2] ?? -1]).toBe('8px');
  });

  it('marks a removal with NO_VALUE in place of the value', () => {
    recordRemoveGlobalVariable('--gap');

    const { ops, strings } = takeBatch();
    expect(ops[0]).toBe(OP_SET_GLOBAL_VARIABLE);
    expect(strings[ops[1] ?? -1]).toBe('--gap');
    expect(ops[2]).toBe(NO_VALUE);
  });

  it('shares one table entry between a name and an equal value', () => {
    recordSetGlobalVariable('same', 'same');

    const { ops, strings } = takeBatch();
    expect(strings).toEqual(['same']);
    expect(ops[1]).toBe(ops[2]);
  });

  it('takes a slot of its own in the op numbering', () => {
    expect(OP_SET_GLOBAL_VARIABLE).toBe(15);
  });
});
