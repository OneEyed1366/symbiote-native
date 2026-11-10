import { isRecord, readNumber, roundFloat } from './value-readers.ts';

const MAX_CHANNEL = 255;
const MAX_ALPHA_DIGITS = 3;

function toHexChannel(channel: number): string {
  const clamped = Math.min(MAX_CHANNEL, Math.max(0, Math.round(channel)));
  return clamped.toString(16).padStart(2, '0');
}

// `rgba(0, 0, 0, .3)` survives lightningcss as alpha 0.3019607961177826, the f32 of 77/255
// Prints the shortest decimal that quantizes back to the same byte, so it reads like the source
function shortestAlpha(alpha: number): number {
  const byte = Math.round(alpha * MAX_CHANNEL);

  for (let digits = 1; digits <= MAX_ALPHA_DIGITS; digits++) {
    const candidate = Number(alpha.toFixed(digits));
    if (Math.round(candidate * MAX_CHANNEL) === byte) return candidate;
  }

  return roundFloat(alpha);
}

function opaqueHex(red: number, green: number, blue: number): string {
  const hex = `${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
  const isShortenable =
    hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5];
  return isShortenable ? `#${hex[0]}${hex[2]}${hex[4]}` : `#${hex}`;
}

function readAll(values: readonly unknown[]): number[] | null {
  const numbers = values.map(readNumber);
  return numbers.every((entry): entry is number => entry !== null)
    ? numbers
    : null;
}

/**
 * A lightningcss `CssColor` as the string Fabric already gets: a hex when opaque (`#000`,
 * `#0f1e30`) and `rgba(r, g, b, a)` when translucent. Every legacy notation arrives as `rgb`,
 * and a wide-gamut color (`oklch`, `lab`) has no RN form, so it answers `null`
 */
export function colorToCss(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (value.type === 'currentcolor') return 'currentColor';
  if (value.type !== 'rgb') return null;

  const channels = readAll([value.r, value.g, value.b, value.alpha]);
  if (channels === null) return null;

  const [red = 0, green = 0, blue = 0, alpha = 1] = channels;
  if (alpha < 1) {
    const rounded = [red, green, blue].map(Math.round).join(', ');
    return `rgba(${rounded}, ${shortestAlpha(alpha)})`;
  }
  return opaqueHex(red, green, blue);
}
