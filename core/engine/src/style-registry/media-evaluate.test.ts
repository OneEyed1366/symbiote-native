// The evaluator reads the tuple tree the css-parser emits, against one snapshot of the environment

import { describe, expect, it } from 'vitest';
import {
  evaluateMedia,
  type IMediaCondition,
  type IMediaEnvironment,
} from './media-evaluate';

const PORTRAIT_PHONE: IMediaEnvironment = {
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

function holds(
  condition: IMediaCondition,
  env: Partial<IMediaEnvironment> = {},
): boolean {
  return evaluateMedia(condition, { ...PORTRAIT_PHONE, ...env });
}

describe('evaluateMedia', () => {
  it('compares a numeric feature with every operator', () => {
    expect(holds(['>=', 'width', 390])).toBe(true);
    expect(holds(['>', 'width', 390])).toBe(false);
    expect(holds(['<=', 'width', 390])).toBe(true);
    expect(holds(['<', 'width', 390])).toBe(false);
    expect(holds(['=', 'width', 390])).toBe(true);
  });

  it('reads the aspect ratio of the window as width over height', () => {
    expect(holds(['=', 'aspect-ratio', 390 / 844])).toBe(true);
    expect(holds(['<', 'aspect-ratio', 1])).toBe(true);
    expect(holds(['>', 'aspect-ratio', 1])).toBe(false);
  });

  it('has no aspect ratio for a window without height', () => {
    expect(holds(['>=', 'aspect-ratio', 0], { height: 0 })).toBe(false);
  });

  it('matches a keyword feature by equality', () => {
    expect(holds(['=', 'orientation', 'portrait'])).toBe(true);
    expect(holds(['=', 'orientation', 'landscape'])).toBe(false);
    expect(holds(['=', 'platform', 'ios'])).toBe(true);
    expect(
      holds(['=', 'prefers-color-scheme', 'dark'], {
        'prefers-color-scheme': 'dark',
      }),
    ).toBe(true);
  });

  it('reads a range operator on a keyword feature as false', () => {
    expect(holds(['>=', 'orientation', 'portrait'])).toBe(false);
  });

  it('joins children with `&` and `|`, and an empty `&` is true', () => {
    expect(
      holds([
        '&',
        [
          ['>=', 'width', 300],
          ['<=', 'width', 400],
        ],
      ]),
    ).toBe(true);
    expect(
      holds([
        '&',
        [
          ['>=', 'width', 300],
          ['<=', 'width', 380],
        ],
      ]),
    ).toBe(false);
    expect(
      holds([
        '|',
        [
          ['>=', 'width', 900],
          ['=', 'platform', 'ios'],
        ],
      ]),
    ).toBe(true);
    expect(holds(['&', []])).toBe(true);
  });

  it('negates with `!`', () => {
    expect(holds(['!', ['=', 'orientation', 'landscape']])).toBe(true);
    expect(holds(['!', ['&', []]])).toBe(false);
  });

  it('follows the environment when it changes', () => {
    const wide = ['>=', 'width', 600] as const;
    expect(holds(wide)).toBe(false);
    expect(
      holds(wide, { width: 844, height: 390, orientation: 'landscape' }),
    ).toBe(true);
  });
});
