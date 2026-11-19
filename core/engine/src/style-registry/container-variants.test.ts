// What a consumer ships to the host: its container conditions with the window already settled, and
// the style it takes for each mask of conditions that hold. Bit `i` of a mask is `conditions[i]`

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IMediaCondition, IMediaEnvironment } from './media-evaluate';
import {
  clearGlobalStyles,
  containerVariantsOf,
  registerRules,
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

const WIDE: IMediaCondition = ['@', null, ['>=', 'width', 400]];
const TALL: IMediaCondition = ['@', 'side', ['>', 'height', 100]];
const DARK: IMediaCondition = ['=', 'prefers-color-scheme', 'dark'];

function rule(
  token: string,
  style: Record<string, unknown>,
  cond?: number,
  order = 0,
) {
  return {
    tokens: [token],
    specificity: [0, 1, 0] as const,
    order,
    style,
    cond,
  };
}

beforeEach(() => {
  clearGlobalStyles();
  setMediaEnvironment(PHONE);
});

afterEach(() => clearGlobalStyles());

describe('containerVariantsOf', () => {
  it('lists the one condition and the style that applies while it holds', () => {
    registerRules(
      [rule('card', { padding: 4 }), rule('card', { padding: 16 }, 0, 1)],
      [WIDE],
    );

    expect(containerVariantsOf('card')).toEqual([[WIDE], [1, { padding: 16 }]]);
  });

  it('gives a style for every mask that mixes the conditions of one class', () => {
    registerRules(
      [
        rule('card', { padding: 4 }),
        rule('card', { padding: 16 }, 0, 1),
        rule('card', { margin: 8 }, 1, 2),
      ],
      [WIDE, TALL],
    );

    expect(containerVariantsOf('card')).toEqual([
      [WIDE, TALL],
      [1, { padding: 16 }],
      [2, { padding: 4, margin: 8 }],
      [3, { padding: 16, margin: 8 }],
    ]);
  });

  it('settles a window condition to a constant and keeps the container leaf', () => {
    const darkAndWide: IMediaCondition = ['&', [DARK, WIDE]];
    registerRules(
      [rule('card', { padding: 4 }), rule('card', { padding: 16 }, 0, 1)],
      [darkAndWide],
    );

    expect(containerVariantsOf('card')?.[0]).toEqual([['&', [false, WIDE]]]);

    setMediaEnvironment({ ...PHONE, 'prefers-color-scheme': 'dark' });

    expect(containerVariantsOf('card')?.[0]).toEqual([['&', [true, WIDE]]]);
  });

  it('answers nothing for a class that reads no container condition', () => {
    registerRules(
      [rule('plain', { padding: 4 }), rule('dark', { color: 'white' }, 0)],
      [DARK],
    );

    expect(containerVariantsOf('plain')).toBeUndefined();
    expect(containerVariantsOf('dark')).toBeUndefined();
    expect(containerVariantsOf('unknown')).toBeUndefined();
  });

  it('answers nothing for a class with more conditions than a mask table should hold', () => {
    const many = [1, 2, 3, 4, 5].map((width): IMediaCondition => [
      '@',
      null,
      ['>=', 'width', width],
    ]);
    registerRules(
      many.map((_, at) => rule('big', { padding: at }, at, at)),
      many,
    );

    expect(containerVariantsOf('big')).toBeUndefined();
  });

  it('hands the same envelope back until the cascade moves', () => {
    registerRules([rule('card', { padding: 16 }, 0)], [WIDE]);
    const first = containerVariantsOf('card');

    expect(containerVariantsOf('card')).toBe(first);

    registerRules([rule('card', { margin: 2 }, 0, 5)], [WIDE]);

    expect(containerVariantsOf('card')).toEqual([
      [WIDE],
      [1, { padding: 16, margin: 2 }],
    ]);
  });
});
