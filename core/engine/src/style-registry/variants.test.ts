import { beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules, resolveClassName } from './index';

type IRuleStyle = Record<string, unknown>;

// The compiler adds one to the middle number for a state, so a state rule outranks its base
function rule(
  style: IRuleStyle,
  specificity: [number, number, number] = [0, 1, 0],
  order = 0,
) {
  return { tokens: ['btn'], specificity, order, style };
}

describe('a state rule next to the rule of its class', () => {
  beforeEach(() => clearGlobalStyles());

  it('keeps the base as the default beside the state value', () => {
    registerRules([
      rule({ color: 'red' }),
      rule({ color: { ':hover': 'blue' } }, [0, 2, 0], 1),
    ]);

    expect(resolveClassName('btn')).toEqual({
      color: { default: 'red', ':hover': 'blue' },
    });
  });

  it('gives a state value alone when nothing is the base', () => {
    registerRules([rule({ color: { ':hover': 'blue' } }, [0, 2, 0])]);

    expect(resolveClassName('btn')).toEqual({ color: { ':hover': 'blue' } });
  });

  it('takes the base from a rule written after the state rule', () => {
    registerRules([
      rule({ color: { ':hover': 'blue' } }, [0, 2, 0], 0),
      rule({ color: 'red' }, [0, 1, 0], 1),
    ]);

    expect(resolveClassName('btn')).toEqual({
      color: { default: 'red', ':hover': 'blue' },
    });
  });

  it('joins the values of different states of one property', () => {
    registerRules([
      rule({ color: { ':hover': 'blue' } }, [0, 2, 0], 0),
      rule({ color: { ':focus': 'green' } }, [0, 2, 0], 1),
    ]);

    expect(resolveClassName('btn')).toEqual({
      color: { ':hover': 'blue', ':focus': 'green' },
    });
  });

  it('lets a later rule of the same state win', () => {
    registerRules([
      rule({ color: { ':hover': 'blue' } }, [0, 2, 0], 0),
      rule({ color: { ':hover': 'teal' } }, [0, 2, 0], 1),
    ]);

    expect(resolveClassName('btn')).toEqual({ color: { ':hover': 'teal' } });
  });

  it('leaves the properties a state rule does not name as the base had them', () => {
    registerRules([
      rule({ color: 'red', width: 10 }),
      rule({ color: { ':hover': 'blue' } }, [0, 2, 0], 1),
    ]);

    expect(resolveClassName('btn').width).toBe(10);
  });

  it('merges the same way across the classes of an element', () => {
    const base = { tokens: ['a'], specificity: [0, 1, 0] as const, order: 0 };
    const state = { tokens: ['b'], specificity: [0, 2, 0] as const, order: 1 };
    const hover: IRuleStyle = { color: { ':hover': 'blue' } };
    registerRules([
      { ...base, style: { color: 'red' } },
      { ...state, style: hover },
    ]);

    expect(resolveClassName('a b')).toEqual({
      color: { default: 'red', ':hover': 'blue' },
    });
  });
});
