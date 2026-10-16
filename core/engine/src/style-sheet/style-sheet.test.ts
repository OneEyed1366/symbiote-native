// Unit test for the StyleSheet API. create/flatten/compose/absoluteFill run against plain
// objects; hairlineWidth/roundToNearestPixel read the scale off RN's own `Dimensions`.
// Every StyleSheet member is total (never throws), so there is no Negative group

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dimensions } from '../react-native-host';
import { StyleSheet, computeHairlineWidth } from './index';

const SIMULATOR_SCALE = 3;

function setWindowScale(scale: number): void {
  const metrics = { width: 390, height: 844, scale, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
}

afterEach(() => {
  setWindowScale(SIMULATOR_SCALE);
  vi.unstubAllGlobals();
});

describe('StyleSheet', () => {
  describe('create', () => {
    it('is identity — input entries are preserved', () => {
      const input = { box: { flex: 1, padding: 8 }, title: { color: 'red' } };
      const created = StyleSheet.create(input);
      expect(created).toEqual(input);
      expect(created.box.flex).toBe(1);
    });

    // RN freezes each entry under `__DEV__`, so a write to one fails where it is made
    it('freezes every entry in a dev bundle', () => {
      vi.stubGlobal('__DEV__', true);
      const created = StyleSheet.create({
        box: { flex: 1 },
        title: { top: 2 },
      });

      expect(Object.isFrozen(created.box)).toBe(true);
      expect(Object.isFrozen(created.title)).toBe(true);
    });

    it('leaves the entries writable in a release bundle', () => {
      vi.stubGlobal('__DEV__', false);
      const created = StyleSheet.create({ box: { flex: 1 } });

      expect(Object.isFrozen(created.box)).toBe(false);
    });
  });

  describe('flatten', () => {
    it('merges with later keys winning (reuses shared flattenStyle)', () => {
      expect(StyleSheet.flatten([{ a: 1 }, { a: 2, b: 3 }])).toEqual({
        a: 2,
        b: 3,
      });
    });

    // Порт `flattenStyle-test.js` RN
    describe('RN flattenStyle semantics', () => {
      const classes = StyleSheet.create({
        elementA: { width: 1, height: 2 },
        elementB: { height: 3 },
      });

      it('overrides properties, null and undefined included', () => {
        expect(
          StyleSheet.flatten([
            { backgroundColor: '#000', width: 10 },
            { backgroundColor: undefined, width: null },
          ]),
        ).toEqual({ backgroundColor: undefined, width: null });
      });

      it('does not fail on falsy entries', () => {
        expect(() =>
          StyleSheet.flatten([null, false, undefined]),
        ).not.toThrow();
      });

      it('flattens nested arrays', () => {
        const flat = StyleSheet.flatten([
          null,
          [],
          [{ width: 10 }, { height: 20 }],
          { width: 30 },
        ]);
        expect(flat).toEqual({ width: 30, height: 20 });
      });

      it('returns undefined and allocates nothing for no style', () => {
        expect(StyleSheet.flatten(null)).toBeUndefined();
        expect(StyleSheet.flatten(undefined)).toBeUndefined();
      });

      it('returns a single style object itself', () => {
        const style = { a: 'b' };
        expect(StyleSheet.flatten(style)).toBe(style);
        expect(StyleSheet.flatten(classes.elementA)).toBe(classes.elementA);
      });

      it('merges classes, the later one winning', () => {
        expect(
          StyleSheet.flatten([classes.elementA, classes.elementB]),
        ).toEqual({
          width: 1,
          height: 3,
        });
        expect(
          StyleSheet.flatten([classes.elementB, classes.elementA]),
        ).toEqual({
          width: 1,
          height: 2,
        });
      });

      it('merges classes with an inline style and nested arrays', () => {
        const nested = [{ width: 10, height: 11 }, { width: 12 }];
        expect(
          StyleSheet.flatten([classes.elementA, classes.elementB, nested]),
        ).toEqual({ width: 12, height: 11 });
      });

      it('ignores an invalid style such as a number', () => {
        expect(StyleSheet.flatten(JSON.parse('1234'))).toBeUndefined();
      });
    });

    describe('setStyleAttributePreprocessor warning', () => {
      it('warns like RN when a preprocessor is overwritten', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        StyleSheet.setStyleAttributePreprocessor('fontFamily', value => value);
        expect(warn).not.toHaveBeenCalled();
        StyleSheet.setStyleAttributePreprocessor('fontFamily', value => value);
        expect(warn).toHaveBeenCalledWith(
          'Overwriting fontFamily style attribute preprocessor',
        );
        warn.mockRestore();
      });

      // RN предупреждает, только когда новая функция отличается от прежней
      it('stays silent when the same preprocessor is set again', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const process = (value: unknown) => value;
        StyleSheet.setStyleAttributePreprocessor('__testSame', process);
        StyleSheet.setStyleAttributePreprocessor('__testSame', process);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
      });
    });

    // Preprocessor переписывает значение одного ключа после схлопывания массива
    it('applies a registered per-attribute preprocessor to the matching flattened key', () => {
      StyleSheet.setStyleAttributePreprocessor('__testDoubled', value =>
        typeof value === 'number' ? value * 2 : value,
      );
      expect(StyleSheet.flatten({ __testDoubled: 5, untouched: 'x' })).toEqual({
        __testDoubled: 10,
        untouched: 'x',
      });
    });

    it('leaves a key with no registered preprocessor untouched', () => {
      expect(StyleSheet.flatten({ __testNoPreprocessor: 5 })).toEqual({
        __testNoPreprocessor: 5,
      });
    });
  });

  describe('absoluteFill', () => {
    it('is four zeroed insets plus position absolute', () => {
      expect(StyleSheet.absoluteFill).toEqual({
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      });
    });

    it('is the same object as absoluteFillObject', () => {
      expect(StyleSheet.absoluteFill).toBe(StyleSheet.absoluteFillObject);
    });
  });

  describe('compose (RN semantics)', () => {
    const x = { a: 1 };
    const y = { b: 2 };

    it('returns a pair when both are present', () => {
      expect(StyleSheet.compose(x, y)).toEqual([x, y]);
    });

    it('returns the present side when the other is nullish', () => {
      expect(StyleSheet.compose(x, undefined)).toBe(x);
      expect(StyleSheet.compose(undefined, y)).toBe(y);
    });

    it('returns null when both are null', () => {
      expect(StyleSheet.compose(null, null)).toBeNull();
    });

    // RN `composeStyles` сравнивает с `== null`, поэтому `0` это присутствующий стиль
    it('treats 0 as a present style rather than falsy, matching RN composeStyles', () => {
      expect(StyleSheet.compose(0, y)).toEqual([0, y]);
      expect(StyleSheet.compose(x, 0)).toEqual([x, 0]);
    });
  });

  describe('hairlineWidth', () => {
    it('follows the window scale RN reports', () => {
      setWindowScale(2);
      expect(StyleSheet.hairlineWidth).toBe(computeHairlineWidth(2));
    });
  });

  describe('computeHairlineWidth', () => {
    // why: at low scale (1x), 0.4 rounds DOWN to 0 — the "rounds to 0" fallback branch
    // (one physical pixel = 1/scale) is a distinct formula from the main rounding path and
    // needs its own proof, not just an assertion that some positive number came out.
    it('falls back to one physical pixel (1/scale) when the rounded width would be 0', () => {
      expect(computeHairlineWidth(1)).toBe(1);
    });

    it('rounds the logical factor to the nearest device pixel at higher scale', () => {
      // Math.round(0.4 * 3) / 3 = Math.round(1.2) / 3 = 1/3.
      expect(computeHairlineWidth(3)).toBeCloseTo(1 / 3, 10);
    });
  });

  describe('roundToNearestPixel', () => {
    it('snaps a size to the nearest whole device pixel at the window scale', () => {
      setWindowScale(3);
      // Math.round(10.2 * 3) / 3 = Math.round(30.6) / 3 = 31/3
      expect(StyleSheet.roundToNearestPixel(10.2)).toBeCloseTo(31 / 3, 10);
    });
  });
});
