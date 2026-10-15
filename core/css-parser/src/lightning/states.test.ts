// A state pseudo-class compiles into the property value Reanimated reads: `{ ':hover': value }`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileCssToRules } from './rules.ts';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

function compile(css: string, pattern?: string) {
  return compileCssToRules(css, {
    filename: 'states.css',
    ...(pattern === undefined ? {} : { pattern }),
  });
}

function onlyRule(css: string) {
  const { rules } = compile(css);
  const [rule] = rules;
  if (rule === undefined) throw new Error('the css compiled to no rule');
  return rule;
}

describe('a rule on a state of a class', () => {
  it('keeps the class as the token and adds the state to the specificity', () => {
    const rule = onlyRule('.btn:hover { opacity: 0.5 }');

    expect(rule.tokens).toEqual(['btn']);
    expect(rule.specificity).toEqual([0, 2, 0]);
  });

  it('writes each value under the state', () => {
    const rule = onlyRule('.btn:hover { opacity: 0.5; width: 10px }');

    expect(rule.style).toEqual({
      opacity: { ':hover': 0.5 },
      width: { ':hover': 10 },
    });
  });

  it.each(['hover', 'focus', 'focus-within', 'active', 'active-deepest'])(
    'is kept for :%s',
    state => {
      const rule = onlyRule(`.btn:${state} { opacity: 0.5 }`);

      expect(rule.style).toEqual({ opacity: { [`:${state}`]: 0.5 } });
    },
  );

  it('is kept inside a :global() of a CSS module', () => {
    const { rules } = compile(
      ':global(.btn:hover) { opacity: 0.5 }',
      '[local]__module__h',
    );

    expect(rules[0]?.style).toEqual({ opacity: { ':hover': 0.5 } });
  });

  it('comes next to the rule of the class, which keeps its plain values', () => {
    const { rules } = compile(
      '.btn { opacity: 1 } .btn:hover { opacity: 0.5 }',
    );

    expect(rules.map(rule => rule.style)).toEqual([
      { opacity: 1 },
      { opacity: { ':hover': 0.5 } },
    ]);
  });
});

describe('a state rule that cannot hold', () => {
  it('is dropped, with a warning, when the state is on an ancestor', () => {
    const { rules } = compile('.card:hover .title { opacity: 0.5 }');

    expect(rules).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is dropped, with a warning, when two states are combined', () => {
    const { rules } = compile('.btn:hover:focus { opacity: 0.5 }');

    expect(rules).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('keeps the plain values and drops the animation keys under a state', () => {
    const rule = onlyRule(
      '.btn:hover { opacity: 0.5; transition-property: opacity; transition-duration: 1s }',
    );

    expect(rule.style).toEqual({ opacity: { ':hover': 0.5 } });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('still drops the pseudo-classes that are no state of a node', () => {
    const { rules } = compile('.btn:nth-child(2) { opacity: 0.5 }');

    expect(rules).toEqual([]);
  });
});
