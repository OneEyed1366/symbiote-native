// transformOrigin/aspectRatio/fontVariant are JS-parsed before
// Fabric (enableNativeCSSParsing defaults to false, so the processor runs in JS). A raw
// `transformOrigin: 'top left'` string reaching Android native crashed casting String to
// ReadableArray. These processors restore RN's JS parse. Expected outputs are RN-exact.
//
// None of the three processors throws on malformed input (each dlogs and returns a
// best-effort/partial result — "never abort a commit over a style value", per the file
// header of process-transform-origin/index.ts), so each describe below is grouped as
// Positive / "rejects the malformed token" rather than Positive/Negative.

import { describe, expect, it } from 'vitest';
import { processTransformOrigin } from './index';
import { processAspectRatio } from '../process-aspect-ratio';
import { processFontVariant } from '../process-font-variant';

describe('processTransformOrigin', () => {
  describe('defaults and passthrough', () => {
    // why: the registry only calls this processor for a present value, but the commit path
    // may still hand it undefined/null — must default to CSS's own center/center/0 default,
    // never throw.
    it('defaults to center/center/0 for undefined', () => {
      expect(processTransformOrigin(undefined)).toEqual(['50%', '50%', 0]);
    });

    it('passes an array input through unchanged (RN re-validates arrays only in __DEV__)', () => {
      expect(processTransformOrigin(['25%', '75%', 3])).toEqual([
        '25%',
        '75%',
        3,
      ]);
    });
  });

  describe('string parse — RN-exact CSS keyword/length tokens', () => {
    it("parses 'top left' to [0, 0, 0] (the crash fix)", () => {
      expect(processTransformOrigin('top left')).toEqual([0, 0, 0]);
    });

    it("parses '50% 100%' keeping percentages as strings, z defaults to 0", () => {
      expect(processTransformOrigin('50% 100%')).toEqual(['50%', '100%', 0]);
    });

    it('parses an explicit numeric z (px, unit dropped)', () => {
      expect(processTransformOrigin('10px 20px 5px')).toEqual([10, 20, 5]);
    });

    it("resolves a single leading 'left' or 'top' token, leaving later axes at default", () => {
      expect(processTransformOrigin('left')).toEqual([0, '50%', 0]);
      expect(processTransformOrigin('top')).toEqual(['50%', 0, 0]);
    });
  });

  describe("'top'/'bottom' as the FIRST token triggers a horizontal lookahead", () => {
    // why: CSS lets 'top'/'bottom' come before its paired horizontal keyword
    // ("top left" == "left top") — the parser must look one token ahead to resolve the pair,
    // a distinct code path from the horizontal-first case already covered above.
    it('resolves the horizontal component from the lookahead token (left/right/center)', () => {
      expect(processTransformOrigin('top left')).toEqual([0, 0, 0]);
      expect(processTransformOrigin('top right')).toEqual(['100%', 0, 0]);
      expect(processTransformOrigin('top center')).toEqual(['50%', 0, 0]);
    });

    it('keeps the default X and stops parsing when no lookahead token follows', () => {
      expect(processTransformOrigin('top')).toEqual(['50%', 0, 0]);
    });

    it('rejects (keeps the partial array) when the lookahead token is not a horizontal keyword', () => {
      expect(processTransformOrigin('top 10px')).toEqual(['50%', 0, 0]);
    });
  });

  describe('malformed combinations are rejected — the partial array parsed so far is returned', () => {
    // why: 'left'/'right' are X-only; a second one after X is already resolved is invalid
    // CSS and must not silently overwrite Y.
    it('rejects a second left/right keyword once X is already resolved', () => {
      expect(processTransformOrigin('left right')).toEqual([0, '50%', 0]);
    });

    // why: 'top'/'bottom' can never be the Z (depth) component.
    it('rejects top/bottom used as the third (z) token', () => {
      expect(processTransformOrigin('right bottom top')).toEqual([
        '100%',
        '100%',
        0,
      ]);
    });

    // why: 'center' can be X or Y but never Z.
    it('rejects center used as the third (z) token', () => {
      expect(processTransformOrigin('10px 20px center')).toEqual([10, 20, 0]);
    });
  });
});

describe('processAspectRatio', () => {
  it('passes a number through (no-op)', () => {
    expect(processAspectRatio(1.5)).toBe(1.5);
  });

  it("parses a '16 / 9' ratio string", () => {
    const ratio = processAspectRatio('16 / 9');
    expect(ratio).toBeCloseTo(16 / 9, 9);
  });

  it("parses a plain numeric string '1.5'", () => {
    expect(processAspectRatio('1.5')).toBe(1.5);
  });

  // why: CSS's 'auto' keyword means "no forced ratio" — must resolve to undefined (no style
  // applied), not NaN or 0.
  it("returns undefined for 'auto'", () => {
    expect(processAspectRatio('auto')).toBeUndefined();
  });
});

describe('processFontVariant', () => {
  it('passes an array through unchanged (no-op)', () => {
    expect(processFontVariant(['small-caps'])).toEqual(['small-caps']);
  });

  it('splits a space-separated string', () => {
    expect(processFontVariant('small-caps tabular-nums')).toEqual([
      'small-caps',
      'tabular-nums',
    ]);
  });
});
