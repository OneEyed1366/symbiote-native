// Unit test: `processTransform` is pure: a STRING transform is
// JS-parsed before Fabric (RN's stock path, enableNativeCSSParsing defaults to false) and an
// ARRAY transform passes through UNCHANGED by reference (the animated / sticky-header hot
// path). Expected string outputs are RN-exact. warnInvalidTransforms never throws (only
// dlogs), so there is no Negative group — malformed array entries are covered under
// "never aborts the commit" instead.

import { describe, expect, it } from 'vitest';
import { processTransform } from './index';

describe('processTransform', () => {
  describe('array input — no-regression passthrough', () => {
    it('returns a single rotate entry unchanged', () => {
      expect(processTransform([{ rotate: '6deg' }])).toEqual([
        { rotate: '6deg' },
      ]);
    });

    it('returns a numeric translateY entry unchanged', () => {
      expect(processTransform([{ translateY: 12 }])).toEqual([
        { translateY: 12 },
      ]);
    });

    it('returns a multi-entry array unchanged', () => {
      expect(processTransform([{ translateX: '50%' }, { scale: 1.2 }])).toEqual(
        [{ translateX: '50%' }, { scale: 1.2 }],
      );
    });

    it('returns the SAME reference (no clone) so the commit flush diffs it as unchanged', () => {
      const input = [{ rotate: '6deg' }];
      expect(processTransform(input)).toBe(input);
    });

    // why: the file header calls this out as CRITICAL — the animated / sticky-header hot
    // path produces malformed-looking entries on transient frames, and validation must never
    // block or alter the committed array, only dlog.
    it('a malformed entry (wrong key count) still passes through unchanged, never throws', () => {
      const input = [{ a: 1, b: 2 }];
      expect(() => processTransform(input)).not.toThrow();
      expect(processTransform(input)).toBe(input);
    });
  });

  describe('string input — RN-exact CSS parse into the entry array', () => {
    it("parses 'rotate(6deg)'", () => {
      expect(processTransform('rotate(6deg)')).toEqual([{ rotate: '6deg' }]);
    });

    it("parses 'translateX(10px)' to a number", () => {
      expect(processTransform('translateX(10px)')).toEqual([
        { translateX: 10 },
      ]);
    });

    it("parses 'scale(1.5)'", () => {
      expect(processTransform('scale(1.5)')).toEqual([{ scale: 1.5 }]);
    });

    // why: a numeric-looking arg (not an angle unit) must become a number, not stay a
    // string — the default-branch's isNaN check is what tells "6deg" (stays string) apart
    // from "0.5" (becomes a number).
    it("parses a plain numeric arg to a number ('scale' already proves this; 'rotate(0.5)' proves the SAME branch for a non-scale key)", () => {
      expect(processTransform('rotate(0.5)')).toEqual([{ rotate: 0.5 }]);
    });

    it("normalizes 'translate(x, y)' to a [x, y] numeric array", () => {
      expect(processTransform('translate(10px, 20px)')).toEqual([
        { translate: [10, 20] },
      ]);
    });

    it('gives a single-axis translate an implicit y of 0', () => {
      expect(processTransform('translate(1px)')).toEqual([
        { translate: [1, 0] },
      ]);
    });

    // why: RN normalizes translate3d down to the 2-value 'translate' key — Fabric has no
    // separate translate3d prop.
    it("normalizes 'translate3d(x, y, z)' down to the 'translate' key", () => {
      expect(processTransform('translate3d(5px, 10px, 0)')).toEqual([
        { translate: [5, 10, 0] },
      ]);
    });

    it('parses a percentage translateX axis to a number', () => {
      expect(processTransform('translateX(10%)')).toEqual([{ translateX: 10 }]);
    });

    // why: matrix is the one key whose args are read as a bare number LIST (no unit
    // suffixes), a parse path entirely distinct from translate/translateX's unit-aware regex.
    it("parses 'matrix(...)' args as a plain number list", () => {
      expect(processTransform('matrix(1, 0, 0, 1, 10, 20)')).toEqual([
        { matrix: [1, 0, 0, 1, 10, 20] },
      ]);
    });

    // why: perspective shares translateX/Y's single-arg-with-unit parse path but is its own
    // transform key — worth its own proof that the key name survives, not just the value.
    it("parses 'perspective(100)'", () => {
      expect(processTransform('perspective(100)')).toEqual([
        { perspective: 100 },
      ]);
    });

    // why: an empty arg list resolves to `value: undefined`, and the entry-push guard
    // (`if (value !== undefined)`) drops it — a transform with no usable value must
    // disappear from the array, not appear as `{ translateX: undefined }`.
    it('drops an entry whose args fail to parse to a value', () => {
      expect(processTransform('translateX()')).toEqual([]);
    });

    it('yields an empty array for an empty string', () => {
      expect(processTransform('')).toEqual([]);
    });

    it('yields an empty array for undefined', () => {
      expect(processTransform(undefined)).toEqual([]);
    });
  });
});
