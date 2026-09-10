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
import { setColorProcessor } from '../platform-color';

const PROCESSED_COLOR = 0x7f_b5_ff_d9;

// The string parser walks each whitespace arg and treats one as the color iff
// processColor(arg) != null, so the stub must reject "0px"/"22px" and accept rgba(...).
function installRealisticColorProcessor(): void {
  setColorProcessor(value => {
    if (typeof value === 'string' && /^(rgba?|hsla?|#)/i.test(value.trim()))
      return PROCESSED_COLOR;
    return null;
  });
}

const ROTATED = 0xff_ff_00_00;

// why: a numeric color is the app author's own literal (`color: 0xff0000ff`, rrggbbaa), not an
// already-resolved platform int - so it owes the same processColor hop a string owes. RN's
// processColor range-checks it and rotates rrggbbaa into aarrggbb; skipping the hop commits
// opaque RED as 0xff0000ff, which native reads as aarrggbb, i.e. blue.
describe('a numeric color goes through the platform processor, exactly like a string', () => {
  function installNumberRotatingProcessor(): void {
    setColorProcessor(value =>
      value === 0xff_00_00_ff ? ROTATED : PROCESSED_COLOR,
    );
  }

  it('processBoxShadow routes a numeric shadow color', () => {
    installNumberRotatingProcessor();
    expect(
      processBoxShadow([{ offsetX: 0, offsetY: 2, color: 0xff_00_00_ff }]),
    ).toEqual([{ offsetX: 0, offsetY: 2, color: ROTATED }]);
  });

  it('processFilter routes a numeric drop-shadow color', () => {
    installNumberRotatingProcessor();
    expect(
      processFilter([
        { dropShadow: { offsetX: 0, offsetY: 2, color: 0xff_00_00_ff } },
      ]),
    ).toEqual([{ dropShadow: { offsetX: 0, offsetY: 2, color: ROTATED } }]);
  });
});

// Reset so the identity processor (the engine default) is restored for any later test.
afterAll(() => {
  setColorProcessor(value => value);
});

describe('processBoxShadow', () => {
  it('returns an empty array for undefined input', () => {
    expect(processBoxShadow(undefined)).toEqual([]);
  });

  // processBoxShadow now imports RN's own implementation, which calls RN's `processColor`
  // directly - so the injected `setColorProcessor` seam no longer governs a colour INSIDE a
  // shadow, and these assertions read the real platform int rather than a stub's sentinel.
  // 0.85 alpha rounds to 217 (0xd9), so rgba(127,181,255,0.85) is 0xd97fb5ff as aarrggbb.
  const RGBA_SAMPLE = 'rgba(127,181,255,0.85)';
  const RGBA_SAMPLE_PROCESSED = 0xd9_7f_b5_ff;

  describe('array form — the colour is processed, not passed through', () => {
    const [shadow] = processBoxShadow([
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 22,
        spreadDistance: 3,
        color: RGBA_SAMPLE,
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

    // why: the whole point of the JS parse. A CSS string reaching Fabric unprocessed is what made
    // shadows paint nothing on device; the payload must carry the platform int.
    it('resolves the colour to a platform int', () => {
      expect(shadow.color).toBe(RGBA_SAMPLE_PROCESSED);
    });

    it('keeps a boolean inset field as-is', () => {
      const [insetShadow] = processBoxShadow([
        { offsetX: 1, offsetY: 2, inset: true },
      ]);
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
      expect(
        processBoxShadow([{ offsetX: 0, offsetY: 0, spreadDistance: 'nope' }]),
      ).toEqual([]);
    });

    // why: blurRadius has an EXTRA constraint beyond parseability — negative blur is
    // physically meaningless, so the guard is `value == null || value < 0`, not just
    // `value == null` like the other length fields.
    it('rejects a negative blurRadius', () => {
      expect(
        processBoxShadow([{ offsetX: 0, offsetY: 0, blurRadius: -5 }]),
      ).toEqual([]);
    });

    it('rejects a color that the processor cannot resolve', () => {
      setColorProcessor(() => null);
      expect(
        processBoxShadow([{ offsetX: 0, offsetY: 0, color: 'anything' }]),
      ).toEqual([]);
    });
  });

  describe('string form — realistic processColor (null for lengths, int for colors)', () => {
    // why: the string parser decides which whitespace-separated arg is the COLOUR by asking
    // processColor and taking the one that resolves - so this exercises the parse and the colour
    // hop together. No stub is installed: upstream calls RN's processColor itself.
    it('parses every component of a full shadow string', () => {
      const shadows = processBoxShadow(`0px 0px 22px 3px ${RGBA_SAMPLE}`);
      expect(shadows).toHaveLength(1);
      const [shadow] = shadows;
      expect(shadow.offsetX).toBe(0);
      expect(shadow.offsetY).toBe(0);
      expect(shadow.blurRadius).toBe(22);
      expect(shadow.spreadDistance).toBe(3);
      expect(shadow.color).toBe(RGBA_SAMPLE_PROCESSED);
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
      expect(processBoxShadow('rgba(0,0,0,1) 0px 0px rgba(1,1,1,1)')).toEqual(
        [],
      );
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
