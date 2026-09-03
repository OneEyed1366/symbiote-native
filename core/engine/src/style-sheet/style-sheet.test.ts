// Unit test for the StyleSheet API. create/flatten/compose/absoluteFill run
// against plain objects; for hairlineWidth/roundToNearestPixel we install a fake
// __turboModuleProxy so getNativeModule('DeviceInfo') returns a known screen scale, then
// assert the width/rounding matches RN's own formula for that scale — never a value copied
// from this module's implementation. Every StyleSheet member is pure/total (never throws),
// so there is no Negative group.

import { afterEach, describe, expect, it } from 'vitest';
import { StyleSheet, computeHairlineWidth } from './index';

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

function installFakeDeviceInfo(getConstants: () => unknown): void {
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    if (name !== 'DeviceInfo') return null;
    const deviceInfo = { getConstants };
    return isType<T>(deviceInfo) ? deviceInfo : null;
  };
}

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

describe('StyleSheet', () => {
  describe('create', () => {
    it('is identity — input entries are preserved', () => {
      const input = { box: { flex: 1, padding: 8 }, title: { color: 'red' } };
      const created = StyleSheet.create(input);
      expect(created).toEqual(input);
      expect(created.box.flex).toBe(1);
    });
  });

  describe('flatten', () => {
    it('merges with later keys winning (reuses shared flattenStyle)', () => {
      expect(StyleSheet.flatten([{ a: 1 }, { a: 2, b: 3 }])).toEqual({
        a: 2,
        b: 3,
      });
    });

    // why: setStyleAttributePreprocessor's whole purpose is rewriting one style key's value
    // AFTER flattenStyle collapses the array — this is the seam that lets, e.g., a color
    // preprocessor run exactly once regardless of how many style-array entries carried it.
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

    // why: nullish, not falsy - and that is the CORRECT behavior, not a gap. React Native's
    // composeStyles branches on `== null` (src/private/styles/composeStyles.js), so `0` is a
    // present style there too, which matters wherever a raw number reaches compose (an animated
    // scale or opacity, say). The file comment used to say "falsy" and was the thing that was
    // wrong; it has been corrected. This test pins the parity so neither drifts again.
    it('treats 0 as a present style rather than falsy, matching RN composeStyles', () => {
      expect(StyleSheet.compose(0, y)).toEqual([0, y]);
      expect(StyleSheet.compose(x, 0)).toEqual([x, 0]);
    });
  });

  describe('hairlineWidth', () => {
    const FAKE_SCALE = 3;

    it('matches RN formula for the faked DeviceInfo screen scale', () => {
      installFakeDeviceInfo(() => ({
        Dimensions: { window: { scale: FAKE_SCALE } },
      }));

      const width = StyleSheet.hairlineWidth;
      expect(typeof width).toBe('number');
      expect(width).toBeGreaterThan(0);
      expect(width).toBe(computeHairlineWidth(FAKE_SCALE));
    });

    // why: Android exposes the scale under windowPhysicalPixels, not window — hairlineWidth
    // must resolve either key, or every Android device would silently fall back to 1px.
    it('falls back to windowPhysicalPixels.scale when window.scale is absent', () => {
      installFakeDeviceInfo(() => ({
        Dimensions: { windowPhysicalPixels: { scale: 2 } },
      }));
      expect(StyleSheet.hairlineWidth).toBe(computeHairlineWidth(2));
    });

    // why: a headless run (no DeviceInfo linked) must degrade to a sane constant, never
    // throw mid-render — the module comment calls this out explicitly.
    it('falls back to 1 when DeviceInfo is not resolvable', () => {
      globalThis.__turboModuleProxy = undefined;
      expect(StyleSheet.hairlineWidth).toBe(1);
    });

    // why: a non-positive scale would make round/divide nonsensical (division by zero, or a
    // negative line width) — the guard treats it as missing rather than propagating garbage.
    it('falls back to 1 when the resolved scale is non-positive', () => {
      installFakeDeviceInfo(() => ({ Dimensions: { window: { scale: 0 } } }));
      expect(StyleSheet.hairlineWidth).toBe(1);
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
    // why: RN's PixelRatio.roundToNearestPixel snaps a dp size to the nearest value that
    // maps to a WHOLE device pixel — used so a hairline border or icon doesn't blur across
    // pixel boundaries; the formula must match RN's exactly (Math.round(size*scale)/scale).
    it('snaps a size to the nearest whole device pixel at the faked scale', () => {
      installFakeDeviceInfo(() => ({ Dimensions: { window: { scale: 3 } } }));
      // Math.round(10.2 * 3) / 3 = Math.round(30.6) / 3 = 31/3.
      expect(StyleSheet.roundToNearestPixel(10.2)).toBeCloseTo(31 / 3, 10);
    });

    it('leaves the value unrounded when the scale is unresolvable (headless)', () => {
      globalThis.__turboModuleProxy = undefined;
      expect(StyleSheet.roundToNearestPixel(10.2)).toBe(10.2);
    });
  });
});
