// JS-side port of RN's processFontVariant: splits a space-separated CSS string
// ('small-caps tabular-nums') into the array native expects, same root cause as
// boxShadow/filter. An array (the common, already-working form) passes through as a no-op.
export function processFontVariant(
  fontVariant: ReadonlyArray<string> | string,
): ReadonlyArray<string> {
  if (Array.isArray(fontVariant)) {
    return fontVariant;
  }

  if (typeof fontVariant === 'string') {
    return fontVariant.split(' ').filter(Boolean);
  }

  return [];
}
