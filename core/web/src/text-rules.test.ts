// The Text props that mean something only on text: line limits, how an overflow is cut, selection

import { describe, expect, it } from 'vitest';
import { textDeclarations } from './text-rules';

describe('text rules', () => {
  describe('numberOfLines', () => {
    it('limits one line with nowrap and an ellipsis', () => {
      expect(textDeclarations({ numberOfLines: 1 })).toEqual({
        display: 'block',
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
        'white-space': 'nowrap',
      });
    });

    it('clamps more than one line', () => {
      expect(textDeclarations({ numberOfLines: 3 })).toEqual({
        display: '-webkit-box',
        overflow: 'hidden',
        '-webkit-box-orient': 'vertical',
        '-webkit-line-clamp': '3',
        'line-clamp': '3',
      });
    });

    it('means no limit for zero, a negative or a number that is none', () => {
      expect(textDeclarations({ numberOfLines: 0 })).toEqual({});
      expect(textDeclarations({ numberOfLines: -2 })).toEqual({});
      expect(textDeclarations({ numberOfLines: Number.NaN })).toEqual({});
    });
  });

  describe('ellipsizeMode', () => {
    it('clips instead of an ellipsis for clip on one line', () => {
      expect(
        textDeclarations({ numberOfLines: 1, ellipsizeMode: 'clip' })[
          'text-overflow'
        ],
      ).toBe('clip');
    });

    it('takes head and middle as the tail, which CSS cannot do', () => {
      expect(
        textDeclarations({ numberOfLines: 1, ellipsizeMode: 'head' })[
          'text-overflow'
        ],
      ).toBe('ellipsis');
    });

    it('writes nothing without a line limit', () => {
      expect(textDeclarations({ ellipsizeMode: 'clip' })).toEqual({});
    });
  });

  describe('selectable', () => {
    it('turns selection off or on', () => {
      expect(textDeclarations({ selectable: false })).toEqual({
        'user-select': 'none',
      });
      expect(textDeclarations({ selectable: true })).toEqual({
        'user-select': 'text',
      });
    });

    it('leaves the browser default when unset', () => {
      expect(textDeclarations({})).toEqual({});
    });
  });
});
