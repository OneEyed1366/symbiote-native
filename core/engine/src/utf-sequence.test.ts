// `UTFSequence.js` of RN: named Unicode sequences, so source code can stay ASCII
import { describe, expect, it } from 'vitest';
import { UTFSequence } from './index';

describe('UTFSequence', () => {
  it('carries the sequences RN names, code point for code point', () => {
    expect({ ...UTFSequence }).toEqual({
      BOM: '﻿',
      BULLET: '•',
      BULLET_SP: ' • ',
      MIDDOT: '·',
      MIDDOT_SP: ' · ',
      MIDDOT_KATAKANA: '・',
      MDASH: '—',
      MDASH_SP: ' — ',
      NDASH: '–',
      NDASH_SP: ' – ',
      NEWLINE: '\u000A',
      NBSP: ' ',
      PIZZA: '🍕',
      TRIANGLE_LEFT: '◀',
      TRIANGLE_RIGHT: '▶',
    });
  });

  // RN freezes it and throws on a write in dev, an object frozen by hand only answers false
  it('throws on a write', () => {
    expect(() => Reflect.set(UTFSequence, 'PIZZA', '')).toThrow();
    expect(UTFSequence.PIZZA).toBe('🍕');
  });
});
