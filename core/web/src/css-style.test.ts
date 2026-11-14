// Style keys of a Fabric payload bag become CSS declarations. The bag also carries plain props,
// so a key that is no style key must leave no declaration

import { describe, expect, it } from 'vitest';
import { cssFromBag, isStyleKey } from './css-style';

describe('css from a payload bag', () => {
  describe('lengths and numbers', () => {
    it('writes a length as px and keeps a percentage as authored', () => {
      expect(cssFromBag({ width: 10, height: '50%' })).toEqual({
        width: '10px',
        height: '50%',
      });
    });

    it('writes opacity, z-index and flex factors without a unit', () => {
      expect(cssFromBag({ opacity: 0.5, zIndex: 3, flexGrow: 2 })).toEqual({
        opacity: '0.5',
        'z-index': '3',
        'flex-grow': '2',
      });
    });

    it('turns a camelCase key into its kebab-case property', () => {
      expect(
        cssFromBag({ backgroundColor: 'red', borderTopLeftRadius: 4 }),
      ).toEqual({
        'background-color': 'red',
        'border-top-left-radius': '4px',
      });
    });

    it('keeps a font weight as the string it is', () => {
      expect(cssFromBag({ fontWeight: '700', fontSize: 14 })).toEqual({
        'font-weight': '700',
        'font-size': '14px',
      });
    });

    it('writes a line height as px, unlike CSS where a bare number is a multiplier', () => {
      expect(cssFromBag({ lineHeight: 20 })).toEqual({ 'line-height': '20px' });
    });
  });

  describe('flex', () => {
    it('expands a positive flex to grow n, shrink 0, basis 0', () => {
      expect(cssFromBag({ flex: 2 })).toEqual({
        'flex-grow': '2',
        'flex-shrink': '0',
        'flex-basis': '0px',
      });
    });

    it('expands zero to a fixed box, and a negative to shrink only', () => {
      expect(cssFromBag({ flex: 0 })).toEqual({
        'flex-grow': '0',
        'flex-shrink': '0',
      });
      expect(cssFromBag({ flex: -3 })).toEqual({
        'flex-grow': '0',
        'flex-shrink': '3',
      });
    });
  });

  describe('edges', () => {
    it('expands the horizontal and vertical shorthands to both sides', () => {
      expect(
        cssFromBag({ paddingHorizontal: 8, marginVertical: '2%' }),
      ).toEqual({
        'padding-left': '8px',
        'padding-right': '8px',
        'margin-top': '2%',
        'margin-bottom': '2%',
      });
    });

    it('maps start and end onto logical properties so the writing direction decides', () => {
      expect(
        cssFromBag({
          start: 1,
          end: 2,
          paddingStart: 3,
          marginEnd: 4,
          borderStartWidth: 5,
        }),
      ).toEqual({
        'inset-inline-start': '1px',
        'inset-inline-end': '2px',
        'padding-inline-start': '3px',
        'margin-inline-end': '4px',
        'border-inline-start-width': '5px',
      });
    });
  });

  describe('precedence', () => {
    it('lets the single edge beat the pair and the pair beat the shorthand, whatever the key order', () => {
      const css = cssFromBag({
        paddingLeft: 1,
        paddingHorizontal: 5,
        padding: 9,
      });

      expect(css['padding-left']).toBe('1px');
      expect(css['padding-right']).toBe('5px');
      expect(Object.keys(css)).toEqual([
        'padding',
        'padding-left',
        'padding-right',
      ]);
    });

    it('writes the shorthand before the longhands so the browser reads them in that order', () => {
      expect(
        Object.keys(cssFromBag({ borderTopWidth: 2, borderWidth: 1 })),
      ).toEqual(['border-width', 'border-top-width']);
    });
  });

  describe('structured values', () => {
    it('serializes a transform list in order', () => {
      expect(
        cssFromBag({
          transform: [{ translateX: 5 }, { rotate: '45deg' }, { scale: 2 }],
        }),
      ).toEqual({ transform: 'translateX(5px) rotate(45deg) scale(2)' });
    });

    it('serializes a matrix transform to its six or sixteen numbers', () => {
      expect(
        cssFromBag({ transform: [{ matrix: [1, 0, 0, 1, 10, 20] }] }),
      ).toEqual({
        transform: 'matrix(1, 0, 0, 1, 10, 20)',
      });
    });

    it('writes an origin tuple with px on numbers', () => {
      expect(cssFromBag({ transformOrigin: ['50%', 10, 0] })).toEqual({
        'transform-origin': '50% 10px 0px',
      });
    });
  });

  describe('keys that are not style', () => {
    it('leaves a plain prop out', () => {
      expect(cssFromBag({ testID: 'x', accessibilityLabel: 'y' })).toEqual({});
    });

    it('tells the two apart', () => {
      expect(isStyleKey('paddingHorizontal')).toBe(true);
      expect(isStyleKey('testID')).toBe(false);
    });
  });
});
