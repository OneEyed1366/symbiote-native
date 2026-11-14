// Counts the pixels of an element screenshot near a colour, from any decoded RGBA image
// The lab gives each probe a colour no other rule uses, so a count says which branch painted

const CHANNELS_PER_PIXEL = 4;
const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX_RADIX = 16;

// A simulator may convert sRGB into its display profile, which moves a channel by a few steps
export const COLOR_TOLERANCE = 16;
// On a whole screen the app's own slate greys fall within the default tolerance of a dark probe
export const SCREEN_TOLERANCE = 4;

export type IRgb = readonly [number, number, number];
export type IRgbaImage = { width: number; height: number; data: Uint8Array };

export function hexToRgb(hex: string): IRgb {
  const match = HEX_COLOR.exec(hex);
  if (match === null) throw new Error(`not a #rrggbb colour: "${hex}"`);
  return [
    parseInt(match[1], HEX_RADIX),
    parseInt(match[2], HEX_RADIX),
    parseInt(match[3], HEX_RADIX),
  ];
}

export function countNear(
  image: IRgbaImage,
  target: IRgb,
  tolerance = COLOR_TOLERANCE,
): number {
  const [red, green, blue] = target;
  let count = 0;
  for (
    let offset = 0;
    offset + CHANNELS_PER_PIXEL <= image.data.length;
    offset += CHANNELS_PER_PIXEL
  ) {
    const isNear =
      Math.abs(image.data[offset] - red) <= tolerance &&
      Math.abs(image.data[offset + 1] - green) <= tolerance &&
      Math.abs(image.data[offset + 2] - blue) <= tolerance;
    if (isNear) count += 1;
  }
  return count;
}
