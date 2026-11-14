// The pixel counter of the device lab's e2e test, on plain RGBA bytes
// Lives here, not in `examples/react/e2e`, since the root vitest skips every `e2e` folder
import { describe, expect, it } from 'vitest';
import * as LAB_COLORS from '../examples/react/e2e/lab-colors';
import {
  COLOR_TOLERANCE,
  countNear,
  hexToRgb,
  SCREEN_TOLERANCE,
  type IRgbaImage,
} from '../examples/react/e2e/pixel';

const BYTES_PER_PIXEL = 4;
const OPAQUE = 255;

function imageOf(pixels: readonly (readonly [number, number, number])[]) {
  const data = new Uint8Array(pixels.length * BYTES_PER_PIXEL);
  pixels.forEach(([red, green, blue], index) => {
    data.set([red, green, blue, OPAQUE], index * BYTES_PER_PIXEL);
  });
  const image: IRgbaImage = { width: pixels.length, height: 1, data };
  return image;
}

describe('hexToRgb', () => {
  it('reads a #rrggbb colour in either case', () => {
    expect(hexToRgb('#e63946')).toEqual([230, 57, 70]);
    expect(hexToRgb('#E63946')).toEqual([230, 57, 70]);
  });

  it('refuses a short form and a bare name', () => {
    expect(() => hexToRgb('#fff')).toThrow('not a #rrggbb colour');
    expect(() => hexToRgb('red')).toThrow('not a #rrggbb colour');
  });
});

describe('countNear', () => {
  const rose = hexToRgb('#e63946');

  it('counts exact matches and ignores other colours', () => {
    const image = imageOf([rose, [0, 0, 0], rose, [42, 157, 143]]);

    expect(countNear(image, rose)).toBe(2);
  });

  it('counts a pixel shifted by the tolerance and not one past it', () => {
    const [red, green, blue] = rose;
    const edge = imageOf([[red - COLOR_TOLERANCE, green, blue]]);
    const beyond = imageOf([[red - COLOR_TOLERANCE - 1, green, blue]]);

    expect(countNear(edge, rose)).toBe(1);
    expect(countNear(beyond, rose)).toBe(0);
  });

  it('needs every channel inside the tolerance', () => {
    const [red, green, blue] = rose;
    const image = imageOf([[red, green, blue + COLOR_TOLERANCE + 1]]);

    expect(countNear(image, rose)).toBe(0);
  });

  it('reads the alpha channel as no part of the colour', () => {
    const data = new Uint8Array([...rose, 0]);

    expect(countNear({ width: 1, height: 1, data }, rose)).toBe(1);
  });

  it('counts nothing in an empty image and skips a trailing partial pixel', () => {
    expect(
      countNear({ width: 0, height: 0, data: new Uint8Array() }, rose),
    ).toBe(0);
    const partial = new Uint8Array([...rose, OPAQUE, ...rose]);

    expect(countNear({ width: 2, height: 1, data: partial }, rose)).toBe(1);
  });

  it('tells the lab colours apart at the tolerance', () => {
    const labColors = Object.values(LAB_COLORS);

    expect(labColors).toHaveLength(23);
    for (const [index, color] of labColors.entries()) {
      const others = labColors.filter((_other, at) => at !== index);
      const image = imageOf([color]);
      expect(others.map(other => countNear(image, other))).toEqual(
        others.map(() => 0),
      );
    }
  });

  it('keeps the slate grey of the app out of the dark probe on a whole screen', () => {
    const slate = imageOf([hexToRgb('#313e53')]);
    const dark = hexToRgb('#264653');

    expect(countNear(slate, dark, COLOR_TOLERANCE)).toBe(1);
    expect(countNear(slate, dark, SCREEN_TOLERANCE)).toBe(0);
  });
});
