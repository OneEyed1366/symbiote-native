// A surface variable crosses to native as one op naming the surface and two interned strings

import { beforeEach, describe, expect, it } from 'vitest';
import {
  NO_VALUE,
  OP_SET_VARIABLE,
  resetMutationBuffer,
  takeBatch,
} from './mutation-buffer';
import { setVariable } from './surface-variables';

const SURFACE = 11;

beforeEach(() => {
  resetMutationBuffer();
});

describe('surface variable ops', () => {
  it('writes the surface, the name and the value', () => {
    setVariable(SURFACE, '--gap', '8px');

    const { ops, strings } = takeBatch();
    expect(ops[0]).toBe(OP_SET_VARIABLE);
    expect(ops[1]).toBe(SURFACE);
    expect(strings[ops[2] ?? -1]).toBe('--gap');
    expect(strings[ops[3] ?? -1]).toBe('8px');
  });

  it('marks a removal with NO_VALUE in place of the value', () => {
    setVariable(SURFACE, '--gap', undefined);

    const { ops, strings } = takeBatch();
    expect(ops[0]).toBe(OP_SET_VARIABLE);
    expect(strings[ops[2] ?? -1]).toBe('--gap');
    expect(ops[3]).toBe(NO_VALUE);
  });

  it('takes a slot of its own in the op numbering', () => {
    expect(OP_SET_VARIABLE).toBe(16);
  });

  it('refuses a name that is not a custom property', () => {
    expect(() => setVariable(SURFACE, 'gap', '8px')).toThrow('custom property');
  });
});
