// Кейсы из `processFontVariant-test.js` RN

import { describe, expect, it } from 'vitest';
import { processFontVariant } from './process-font-variant';

describe('processFontVariant', () => {
  it('accepts arrays', () => {
    expect(processFontVariant([])).toEqual([]);
    expect(processFontVariant(['oldstyle-nums'])).toEqual(['oldstyle-nums']);
    expect(processFontVariant(['proportional-nums', 'lining-nums'])).toEqual([
      'proportional-nums',
      'lining-nums',
    ]);
  });

  it('accepts string values', () => {
    expect(processFontVariant('oldstyle-nums')).toEqual(['oldstyle-nums']);
    expect(processFontVariant('lining-nums  ')).toEqual(['lining-nums']);
    expect(processFontVariant('   tabular-nums')).toEqual(['tabular-nums']);
  });

  it('accepts a string with multiple values', () => {
    expect(processFontVariant('oldstyle-nums lining-nums')).toEqual([
      'oldstyle-nums',
      'lining-nums',
    ]);
    expect(
      processFontVariant('proportional-nums  oldstyle-nums   lining-nums'),
    ).toEqual(['proportional-nums', 'oldstyle-nums', 'lining-nums']);
    expect(
      processFontVariant(
        '   small-caps proportional-nums  oldstyle-nums lining-nums',
      ),
    ).toEqual([
      'small-caps',
      'proportional-nums',
      'oldstyle-nums',
      'lining-nums',
    ]);
  });
});
