// platform-color owns the color-processing seam: PlatformColor/DynamicColorIOS are pure
// constructors (no native dependency) and processColor/setColorProcessor are the injection
// point every color-touching module (commit's fabricProps, process-box-shadow, process-filter,
// process-background-image, StatusBar android) resolves a color through. This round-trips the
// pair directly against platform-color, independent of commit.ts, to prove the seam works when
// owned here rather than re-exported from commit.
//
// No throwing path exists anywhere in this module (every function is total over its input
// type), so there is no Negative (toThrow) group. The guards (isOpaqueColorValue /
// isProcessableColor) signal rejection by returning `false`, so the second group below is named
// "returns false" rather than "Negative".

import { afterEach, describe, expect, it } from 'vitest';
import {
  DynamicColorIOS,
  isOpaqueColorValue,
  isProcessableColor,
  PlatformColor,
  processColor,
  setColorProcessor,
} from './index';

describe('processColor / setColorProcessor', () => {
  afterEach(() => {
    // Restore the engine default (identity) so later tests never see a leaked processor.
    setColorProcessor(value => value);
  });

  // why: this is the whole point of the seam — every color-touching module (commit,
  // box-shadow, background-image, StatusBar) must see the SAME injected processor.
  it('runs a color through the injected processor', () => {
    setColorProcessor(value => (value === 'red' ? 0xff_00_00 : null));
    expect(processColor('red')).toBe(0xff_00_00);
  });

  // why: headless (no host wired a real RN processColor) must still resolve colors, just
  // unchanged, rather than throw or return undefined.
  it('defaults to identity when no processor has been installed', () => {
    expect(processColor('blue')).toBe('blue');
  });

  it('an opaque PlatformColor value is routed through the processor exactly like a CSS string', () => {
    setColorProcessor(value =>
      isOpaqueColorValue(value) ? 'resolved-opaque' : null,
    );
    expect(processColor(PlatformColor('systemBlue'))).toBe('resolved-opaque');
  });
});

describe('PlatformColor / DynamicColorIOS — building opaque color values', () => {
  // why: PlatformColor is the public constructor for RN's semantic system colors
  // ('systemBlue', 'labelColor'); its result must be recognizable downstream as an opaque
  // color, not a CSS string, or the color seam would try to processColor() a plain string.
  it('PlatformColor produces a semantic-tagged value recognized as opaque', () => {
    const color = PlatformColor('systemBlue', 'labelColor');
    expect(isOpaqueColorValue(color)).toBe(true);
    expect(color.semantic).toEqual(['systemBlue', 'labelColor']);
  });

  // why: DynamicColorIOS's whole purpose is picking light/dark per appearance; the tuple
  // must round-trip into the opaque `dynamic` shape the seam recognizes.
  it('DynamicColorIOS carries the light/dark tuple as an opaque dynamic value', () => {
    const color = DynamicColorIOS({ light: '#fff', dark: '#000' });
    expect(isOpaqueColorValue(color)).toBe(true);
    expect(color.dynamic).toEqual({
      light: '#fff',
      dark: '#000',
      highContrastLight: undefined,
      highContrastDark: undefined,
    });
  });

  it('DynamicColorIOS carries the optional high-contrast fields when given', () => {
    const color = DynamicColorIOS({
      light: '#fff',
      dark: '#000',
      highContrastLight: '#eee',
      highContrastDark: '#111',
    });
    expect(color.dynamic).toEqual({
      light: '#fff',
      dark: '#000',
      highContrastLight: '#eee',
      highContrastDark: '#111',
    });
  });
});

describe('isOpaqueColorValue / isProcessableColor — returns false for anything not a real color', () => {
  it('isOpaqueColorValue accepts a semantic or dynamic object, rejects everything else', () => {
    expect(isOpaqueColorValue(PlatformColor('systemBlue'))).toBe(true);
    expect(
      isOpaqueColorValue(DynamicColorIOS({ light: '#fff', dark: '#000' })),
    ).toBe(true);
    // why: a CSS string is a valid color everywhere else in the system, but it is NOT an
    // "opaque" value — the seam must tell the two apart to decide whether processColor is
    // even needed.
    expect(isOpaqueColorValue('red')).toBe(false);
    expect(isOpaqueColorValue({ notAColor: true })).toBe(false);
    expect(isOpaqueColorValue(null)).toBe(false);
    expect(isOpaqueColorValue(42)).toBe(false);
  });

  it('isProcessableColor accepts a CSS string and an opaque color, rejects a bare number or undefined', () => {
    expect(isProcessableColor('rgba(0,0,0,1)')).toBe(true);
    expect(isProcessableColor(PlatformColor('systemBlue'))).toBe(true);
    // why: a platform int (already the Fabric-resolved output) must NOT be re-run through
    // the processor — isProcessableColor is how callers tell "still needs processing" apart
    // from "already resolved".
    expect(isProcessableColor(0xff_00_00)).toBe(false);
    expect(isProcessableColor(undefined)).toBe(false);
  });
});
