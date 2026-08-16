// boxShadow/filter are JS-parsed before Fabric. RN registers
// these behind enableNativeCSSParsing (default false), so a raw string is dropped on device.
// processBoxShadow/processFilter restore RN's JS parse. Two coverage paths: ARRAY form (color
// detection irrelevant) and STRING form (needs a realistic processColor classifying each arg).
//
// processBoxShadow never throws — every invalid field rejects the WHOLE shadow list to []
// (web semantics: an invalid box-shadow paints nothing), so "rejects" below means "resolves
// to []", not a thrown error. There is no Negative (toThrow) group.

import { afterAll, describe, expect, it } from 'vitest';
import { processBoxShadow } from './index';
import { processFilter } from '../process-filter';
import { setColorProcessor } from '../commit';

const PROCESSED_COLOR = 0x7f_b5_ff_d9;

// The string parser walks each whitespace arg and treats one as the color iff
// processColor(arg) != null, so the stub must reject "0px"/"22px" and accept rgba(...).
function installRealisticColorProcessor(): void {
  setColorProcessor(value => {
    if (typeof value === 'string' && /^(rgba?|hsla?|#)/i.test(value.trim())) return PROCESSED_COLOR;
    return null;
  });
}

// Reset so the identity processor (the engine default) is restored for any later test.
afterAll(() => {
  setColorProcessor(value => value);
});

describe('processBoxShadow', () => {
  it('returns an empty array for undefined input', () => {
    expect(processBoxShadow(undefined)).toEqual([]);
  });

  describe('array form — identity processColor passes the color object through', () => {
    const [shadow] = processBoxShadow([
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 22,
        spreadDistance: 3,
        color: 'rgba(127,181,255,0.85)',
      },
    ]);

    it('keeps the offsets', () => {
      expect(shadow.offsetX).toBe(0);
      expect(shadow.offsetY).toBe(0);
    });

    it('keeps the blur and spread', () => {
      expect(shadow.blurRadius).toBe(22);
      expect(shadow.spreadDistance).toBe(3);
    });

    it('passes the color through untouched', () => {
      expect(shadow.color).toBe('rgba(127,181,255,0.85)');
    });

    it('keeps a boolean inset field as-is', () => {
      const [insetShadow] = processBoxShadow([{ offsetX: 1, offsetY: 2, inset: true }]);
      expect(insetShadow.inset).toBe(true);
    });
  });

  describe('array form — an invalid field rejects the whole list, never throws', () => {
    // why: each field's validity check has its own reject branch (offsetX/offsetY/
    // spreadDistance/blurRadius/color) — each is a distinct logical outcome in the source
    // and must be proven independently, not just inferred from one working case.
    it('rejects an unparseable offsetY', () => {
      expect(processBoxShadow([{ offsetX: 0, offsetY: 'nope' }])).toEqual([]);
    });

    it('rejects an unparseable spreadDistance', () => {
      expect(processBoxShadow([{ offsetX: 0, offsetY: 0, spreadDistance: 'nope' }])).toEqual([]);
    });

    // why: blurRadius has an EXTRA constraint beyond parseability — negative blur is
    // physically meaningless, so the guard is `value == null || value < 0`, not just
    // `value == null` like the other length fields.
    it('rejects a negative blurRadius', () => {
      expect(processBoxShadow([{ offsetX: 0, offsetY: 0, blurRadius: -5 }])).toEqual([]);
    });

    it('rejects a color that the processor cannot resolve', () => {
      setColorProcessor(() => null);
      expect(processBoxShadow([{ offsetX: 0, offsetY: 0, color: 'anything' }])).toEqual([]);
    });
  });

  describe('string form — realistic processColor (null for lengths, int for colors)', () => {
    it('parses every component of a full shadow string', () => {
      installRealisticColorProcessor();
      const shadows = processBoxShadow('0px 0px 22px 3px rgba(127,181,255,0.85)');
      expect(shadows).toHaveLength(1);
      const [shadow] = shadows;
      expect(shadow.offsetX).toBe(0);
      expect(shadow.offsetY).toBe(0);
      expect(shadow.blurRadius).toBe(22);
      expect(shadow.spreadDistance).toBe(3);
      expect(shadow.color).toBe(PROCESSED_COLOR);
    });

    it('zeroes the whole list on an invalid primitive (web semantics: paint none)', () => {
      installRealisticColorProcessor();
      expect(processBoxShadow('5 0px red')).toHaveLength(0);
    });

    // why: `inset` is a real CSS box-shadow keyword (inner vs outer shadow) — the string
    // parser must recognize it as a keyword, not misclassify it as a length or a color.
    it('parses the inset keyword', () => {
      installRealisticColorProcessor();
      const [shadow] = processBoxShadow('0px 0px inset');
      expect(shadow.offsetX).toBe(0);
      expect(shadow.offsetY).toBe(0);
      expect(shadow.inset).toBe(true);
    });

    // why: CSS box-shadow has exactly one color and one inset keyword per shadow — a second
    // occurrence of either is invalid syntax, must reject the whole shadow.
    it('rejects a shadow string with two colors', () => {
      installRealisticColorProcessor();
      expect(processBoxShadow('rgba(0,0,0,1) 0px 0px rgba(1,1,1,1)')).toEqual([]);
    });

    // why: CSS requires the length values (offsetX/offsetY/blur/spread) to stay grouped
    // together; a keyword (color/inset) breaking up the length run is invalid syntax.
    it('rejects a length token that follows a keyword breaking up the length run', () => {
      installRealisticColorProcessor();
      expect(processBoxShadow('0px inset 0px')).toEqual([]);
    });

    // why: box-shadow allows at most 4 lengths (offsetX, offsetY, blur, spread) — a 5th
    // length token has nowhere valid to go.
    it('rejects more than 4 length tokens', () => {
      installRealisticColorProcessor();
      expect(processBoxShadow('0px 0px 0px 0px 0px')).toEqual([]);
    });

    // why: offsetX/offsetY are mandatory — a shadow expressed as only a keyword (no
    // lengths at all) is missing the required offsets.
    it('rejects a shadow with no length tokens at all', () => {
      installRealisticColorProcessor();
      expect(processBoxShadow('inset')).toEqual([]);
    });
  });
});

describe('processFilter', () => {
  it('passes a structured filter array through as the same primitive', () => {
    const filters = processFilter([{ brightness: 0.5 }]);
    expect(filters).toHaveLength(1);
    expect(filters[0]).toHaveProperty('brightness', 0.5);
  });

  it('parses a filter string, applying _getFilterAmount per function', () => {
    installRealisticColorProcessor();
    const filters = processFilter('brightness(50%) hue-rotate(90deg)');
    expect(filters).toHaveLength(2);
    // 50% maps 1:1 to 0.5; hue-rotate camelizes to hueRotate with a degree number.
    expect(filters[0]).toHaveProperty('brightness', 0.5);
    expect(filters[1]).toHaveProperty('hueRotate', 90);
  });
});
