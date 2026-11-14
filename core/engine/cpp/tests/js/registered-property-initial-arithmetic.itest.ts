// Ported from wpt `initial-value-unit-arithmetic` and `register-property-sign-mixed-lengths`
// `100vh` has no known size here, so its cases only register and the text stays as written

import { getComputedVariable, registerProperty } from '@symbiote-native/engine';

import { describe, expect, it, report } from './harness';
import { freshRegistry, mountTree, view } from './registered-property-fixtures';

function computedInitial(syntax: string, initialValue: string): string | undefined {
  freshRegistry();
  registerProperty({ name: '--arith', syntax, inherits: false, initialValue });
  const node = view({});
  mountTree(node);
  return getComputedVariable(node, '--arith');
}

function isRegistered(syntax: string, initialValue: string): boolean {
  try {
    computedInitial(syntax, initialValue);
    return true;
  } catch {
    return false;
  }
}

describe('an initial value with typed arithmetic, as in wpt', () => {
  it('multiplies and divides lengths by their dimensions', () => {
    expect(computedInitial('<length>', 'calc(5px * 3px / 6px)')).toBe('2.5px');
  });

  it('scales a length by the sign of a length difference', () => {
    expect(computedInitial('<length>', 'calc(15px + (sign(20px - 10px) * 5px))')).toBe('20px');
  });

  it('accepts the sign of a viewport length in every numeric syntax', () => {
    expect(isRegistered('<length>', 'calc(15px + (sign(100vh - 10px) * 5px))')).toBe(true);
    expect(isRegistered('<number>', 'calc(15 + (sign(100vh - 10px) * 5))')).toBe(true);
    expect(isRegistered('<integer>', 'calc(15 + (sign(100vh - 10px) * 5))')).toBe(true);
    expect(isRegistered('<angle>', 'calc(15deg + (sign(100vh - 10px) * 5deg))')).toBe(true);
    expect(isRegistered('<time>', 'calc(15s + (sign(100vh - 10px) * 5s))')).toBe(true);
    expect(isRegistered('<resolution>', 'calc(15dppx + (sign(100vh - 10px) * 5dpi))')).toBe(true);
  });

  it('refuses a product of lengths read as a length', () => {
    expect(isRegistered('<length>', 'calc(2px * 3px)')).toBe(false);
  });

  it('refuses a math function over mixed dimensions', () => {
    expect(isRegistered('<length>', 'min(1px, 1s)')).toBe(false);
  });
});

report();
