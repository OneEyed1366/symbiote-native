// platform-color owns the color-processing seam: PlatformColor/DynamicColorIOS are pure
// constructors (no native dependency) and processColor/setColorProcessor are the injection
// point every color-touching module (commit's fabricProps, process-box-shadow, process-filter,
// process-background-image, StatusBar android) resolves a color through. This round-trips the
// pair directly against platform-color, independent of commit.ts, to prove the seam works when
// owned here rather than re-exported from commit.
//
// platform-color never throws: every function is a pure constructor/guard/pass-through. So
// there is no Negative (toThrow) group; every scenario below is Positive.

import { afterEach, describe, expect, it } from 'vitest';
import {
  DynamicColorIOS,
  isOpaqueColorValue,
  isProcessableColor,
  PlatformColor,
  processColor,
  setColorProcessor,
} from './platform-color';

describe('PlatformColor / DynamicColorIOS constructors', () => {
  // why: PlatformColor names a platform-semantic color (e.g. 'systemBlue') for the
  // native side to resolve -- the constructor's whole job is wrapping the name(s)
  // into the opaque shape processColor/RCTConvert reads.
  it('PlatformColor wraps its names into a semantic opaque color', () => {
    expect(PlatformColor('systemBlue')).toEqual({ semantic: ['systemBlue'] });
  });

  // why: PlatformColor accepts multiple names (a fallback chain a platform
  // resolves in order) -- all of them must be preserved, not just the first.
  it('PlatformColor preserves multiple fallback names', () => {
    expect(PlatformColor('labelColor', 'systemBlue')).toEqual({
      semantic: ['labelColor', 'systemBlue'],
    });
  });

  // why: DynamicColorIOS is the appearance-aware (light/dark) counterpart --
  // every field of the tuple, including the optional high-contrast variants, must
  // survive into the opaque value untouched.
  it('DynamicColorIOS wraps the full tuple into a dynamic opaque color', () => {
    expect(
      DynamicColorIOS({
        light: '#ffffff',
        dark: '#000000',
        highContrastLight: '#eeeeee',
        highContrastDark: '#111111',
      }),
    ).toEqual({
      dynamic: {
        light: '#ffffff',
        dark: '#000000',
        highContrastLight: '#eeeeee',
        highContrastDark: '#111111',
      },
    });
  });

  // why: the high-contrast fields are documented optional -- omitting them must
  // leave them genuinely undefined, not coerced to some other falsy value.
  it('DynamicColorIOS leaves omitted high-contrast fields undefined', () => {
    const result = DynamicColorIOS({ light: '#fff', dark: '#000' });
    expect(result.dynamic?.highContrastLight).toBeUndefined();
    expect(result.dynamic?.highContrastDark).toBeUndefined();
  });
});

describe('isOpaqueColorValue', () => {
  it('is true for a PlatformColor value', () => {
    expect(isOpaqueColorValue(PlatformColor('systemBlue'))).toBe(true);
  });

  it('is true for a DynamicColorIOS value', () => {
    expect(isOpaqueColorValue(DynamicColorIOS({ light: '#fff', dark: '#000' }))).toBe(true);
  });

  // why: a CSS color string is the OTHER half of IColorValue -- it must be
  // rejected here, since isOpaqueColorValue's whole job is telling the two apart.
  it('is false for a plain CSS color string', () => {
    expect(isOpaqueColorValue('#ff0000')).toBe(false);
  });

  it('is false for null and a plain object with neither field', () => {
    expect(isOpaqueColorValue(null)).toBe(false);
    expect(isOpaqueColorValue({})).toBe(false);
  });
});

describe('isProcessableColor', () => {
  // why: this is the gate every color-touching consumer uses to decide whether a
  // style value needs to go through the platform processor at all -- strings and
  // opaque colors do, everything else (an already-resolved platform int, or no
  // value) does not.
  it('is true for a CSS string and an opaque color, false for a number or undefined', () => {
    expect(isProcessableColor('#ff0000')).toBe(true);
    expect(isProcessableColor(PlatformColor('systemBlue'))).toBe(true);
    expect(isProcessableColor(0xff_00_00)).toBe(false);
    expect(isProcessableColor(undefined)).toBe(false);
  });
});

describe('processColor / setColorProcessor', () => {
  afterEach(() => {
    // Restore the engine default (identity) so later tests never see a leaked processor.
    setColorProcessor(value => value);
  });

  it('runs a color through the injected processor', () => {
    setColorProcessor(value => (value === 'red' ? 0xff_00_00 : null));
    expect(processColor('red')).toBe(0xff_00_00);
  });

  it('defaults to identity when no processor has been installed', () => {
    expect(processColor('blue')).toBe('blue');
  });

  // why: an opaque PlatformColor value must reach the SAME injected processor as a
  // plain string -- this is the seam's whole purpose (routing both color shapes
  // through one platform-specific resolver), not just a string pass-through.
  it('runs an opaque PlatformColor value through the injected processor too', () => {
    const opaque = PlatformColor('systemBlue');
    let received: unknown;
    setColorProcessor(value => {
      received = value;
      return 42;
    });
    expect(processColor(opaque)).toBe(42);
    expect(received).toBe(opaque);
  });
});
