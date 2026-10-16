import { isRecord, readNumber, roundFloat } from './value-readers.ts';

type IRgba = { r: number; g: number; b: number; alpha: number };

function toHexChannel(channel: number): string {
  const clamped = Math.min(255, Math.max(0, Math.round(channel)));
  return clamped.toString(16).padStart(2, '0');
}

// `rgba(0, 0, 0, .3)` survives lightningcss as alpha 0.3019607961177826, the f32 of 77/255
// This prints the shortest decimal that quantizes back to the same byte, so it reads as authored
function shortestAlpha(alpha: number): number {
  const byte = Math.round(alpha * 255);

  for (let digits = 1; digits <= 3; digits++) {
    const candidate = Number(alpha.toFixed(digits));
    if (Math.round(candidate * 255) === byte) return candidate;
  }

  return roundFloat(alpha);
}

function readRgba(value: Record<string, unknown>): IRgba | null {
  const channels = [value.r, value.g, value.b, value.alpha].map(readNumber);
  if (!channels.every((channel): channel is number => channel !== null)) {
    return null;
  }
  const [r = 0, g = 0, b = 0, alpha = 1] = channels;
  return { r, g, b, alpha };
}

function toHex({ r, g, b }: IRgba): string {
  const hex = `${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
  const isShortenable =
    hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5];
  return isShortenable ? `#${hex[0]}${hex[2]}${hex[4]}` : `#${hex}`;
}

/**
 * A lightningcss `CssColor` as the string Fabric already gets: a hex when opaque, and
 * `rgba(r, g, b, a)` when translucent. A wide-gamut color (`oklch`, `lab`) has no RN equivalent,
 * so it returns null and the caller drops it with a warning
 */
export function colorToCss(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (value.type === 'currentcolor') return 'currentColor';
  if (value.type !== 'rgb') return null;

  const color = readRgba(value);
  if (color === null) return null;
  if (color.alpha >= 1) return toHex(color);

  const { r, g, b, alpha } = color;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${shortestAlpha(alpha)})`;
}
