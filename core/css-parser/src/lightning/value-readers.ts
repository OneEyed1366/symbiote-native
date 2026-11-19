// Readers for the `unknown` values lightningcss hands over, each answering `null` for a wrong shape

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function readType(value: unknown): string | null {
  return isRecord(value) ? readString(value.type) : null;
}

// lightningcss stores lengths, alphas and ratios as f32, so `1.4` comes back as 1.399999976158142
// Seven significant digits restore the authored decimal without inventing one
export function roundFloat(value: number): number {
  return Number(value.toPrecision(7));
}
