// Pure RGBA parsing — no graph node, no AnimatedValue, no imports from this package at all.
//
// It is split out of color.ts DELIBERATELY, and must stay dependency-free. `interpolation.ts`
// needs `normalizeColor` for its color output ranges, and `graph.ts` needs `interpolation.ts`
// (AnimatedInterpolation lives there). color.ts also defines `AnimatedColor extends
// AnimatedWithChildren`, so leaving the parser there closes a cycle
//   graph -> interpolation -> color -> graph
// which surfaces at load time as `TypeError: Class extends value undefined is not a
// constructor` — AnimatedWithChildren is still uninitialized when color.ts evaluates. Keeping
// the pure half in its own leaf module breaks it structurally rather than by import ordering.

export interface IRgbaValue {
  r: number;
  g: number;
  b: number;
  a: number;
}

export const DEFAULT_COLOR: IRgbaValue = { r: 0, g: 0, b: 0, a: 1 };

// Decompose a #hex (3/4/6/8), rgb()/rgba(), or 0xRRGGBBAA number into channels.
// undefined when unparseable (a named/platform color), so the caller falls back to
// the default rather than throwing inside a render. Exported so interpolation's
// color path parses through the same RGBA decoder (DRY) rather than duplicating it.
export function normalizeColor(color: string | number): IRgbaValue | undefined {
  if (typeof color === 'number') {
    const c = color >>> 0;
    return { r: (c >>> 24) & 255, g: (c >>> 16) & 255, b: (c >>> 8) & 255, a: (c & 255) / 255 };
  }
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) return parseHex(trimmed);
  if (/^rgba?\(/i.test(trimmed)) return parseRgb(trimmed);
  return undefined;
}

function parseHex(hex: string): IRgbaValue | undefined {
  let body = hex.slice(1);
  if (body.length === 3 || body.length === 4) {
    body = body
      .split('')
      .map(c => c + c)
      .join('');
  }
  if (body.length !== 6 && body.length !== 8) return undefined;
  const int = Number.parseInt(body, 16);
  if (Number.isNaN(int)) return undefined;
  if (body.length === 6) {
    return { r: (int >>> 16) & 255, g: (int >>> 8) & 255, b: int & 255, a: 1 };
  }
  const c = int >>> 0;
  return { r: (c >>> 24) & 255, g: (c >>> 16) & 255, b: (c >>> 8) & 255, a: (c & 255) / 255 };
}

function parseRgb(str: string): IRgbaValue | undefined {
  const match = /^rgba?\(([^)]+)\)$/i.exec(str);
  if (match === null) return undefined;
  const parts = match[1].split(',').map(part => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some(n => Number.isNaN(n))) return undefined;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length >= 4 ? parts[3] : 1 };
}
