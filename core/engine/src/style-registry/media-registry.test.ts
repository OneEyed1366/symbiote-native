// A rule carrying a `cond` applies only while its condition holds in the current environment

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IMediaCondition, IMediaEnvironment } from './media-evaluate';
import {
  clearGlobalStyles,
  registerRules,
  resolveClassName,
  setMediaEnvironment,
} from './index';

const PHONE: IMediaEnvironment = {
  width: 390,
  height: 844,
  resolution: 3,
  orientation: 'portrait',
  'prefers-color-scheme': 'light',
  'prefers-reduced-motion': 'no-preference',
  'prefers-contrast': 'no-preference',
  'prefers-reduced-transparency': 'no-preference',
  platform: 'ios',
  dir: 'ltr',
};

const WIDE: IMediaCondition = ['>=', 'width', 600];
const DARK: IMediaCondition = ['=', 'prefers-color-scheme', 'dark'];

function rule(token: string, style: Record<string, unknown>, cond?: number, order = 0) {
  return { tokens: [token], specificity: [0, 1, 0] as const, order, style, cond };
}

beforeEach(() => {
  clearGlobalStyles();
  setMediaEnvironment(PHONE);
});

afterEach(() => clearGlobalStyles());

describe('conditional rules', () => {
  it('skips a rule whose condition is false and applies it once it holds', () => {
    registerRules([rule('card', { padding: 4 }), rule('card', { padding: 16 }, 0, 1)], [WIDE]);
    expect(resolveClassName('card')).toEqual({ padding: 4 });

    setMediaEnvironment({ ...PHONE, width: 800 });
    expect(resolveClassName('card')).toEqual({ padding: 16 });
  });

  it('reports the conditions that flipped, and only those', () => {
    registerRules([rule('card', { padding: 16 }, 0), rule('tile', { color: 'white' }, 1)], [WIDE, DARK]);

    expect(setMediaEnvironment({ ...PHONE, width: 800 })).toEqual([0]);
    expect(setMediaEnvironment({ ...PHONE, width: 900 })).toEqual([]);
    expect(setMediaEnvironment({ ...PHONE, width: 900, 'prefers-color-scheme': 'dark' })).toEqual([1]);
  });

  it('keeps the very same object for a class whose conditions did not flip', () => {
    registerRules([rule('card', { padding: 16 }, 0), rule('tile', { color: 'white' }, 1)], [WIDE, DARK]);
    const tileBefore = resolveClassName('tile');

    setMediaEnvironment({ ...PHONE, width: 800 });

    expect(resolveClassName('tile')).toBe(tileBefore);
  });

  it('shares one truth value between two files that declare the same condition', () => {
    registerRules([rule('a', { margin: 1 }, 0)], [WIDE]);
    registerRules([rule('b', { margin: 2 }, 0)], [WIDE]);

    expect(setMediaEnvironment({ ...PHONE, width: 800 })).toEqual([0]);
    expect(resolveClassName('a')).toEqual({ margin: 1 });
    expect(resolveClassName('b')).toEqual({ margin: 2 });
  });
});
