// CSS → React Native value conversion. RN style props take plain numbers for `px` / unitless
// values, so there is no unit conversion needed here beyond scaling `rem`/`em` — `px` is identity.

// symbiote has no root-font-size registry (a DOM `<html>` element would own one); we pick CSS's
// own default of a 16px root font size as the `rem` multiplier, so `2rem` reads as `32`.
const REM_TO_PX = 16;

const NUMBER_WITH_UNIT_PATTERN = /^(-?\d+(?:\.\d+)?)(px|rem|em)?$/;
const PERCENT_PATTERN = /%$/;

/**
 * Convert a CSS dimension to a plain number: strips `px`, scales `rem`/`em` by
 * {@link REM_TO_PX}, and passes unitless numbers through untouched.
 */
export function parseNumeric(value: string): number {
  const trimmed = value.trim();
  const match = trimmed.match(NUMBER_WITH_UNIT_PATTERN);
  if (!match) {
    const bare = parseFloat(trimmed);
    return Number.isNaN(bare) ? 0 : bare;
  }

  const amount = parseFloat(match[1]);
  const unit = match[2];
  return unit === 'rem' || unit === 'em' ? amount * REM_TO_PX : amount;
}

/**
 * Same as {@link parseNumeric}, except a percentage value is kept as a string
 * (`'50%'`) — RN accepts percentage strings for most layout props.
 */
export function parseNumericOrPercent(value: string): number | string {
  const trimmed = value.trim();
  return PERCENT_PATTERN.test(trimmed) ? trimmed : parseNumeric(trimmed);
}

/**
 * Colors, font families, and CSS keyword values (`'bold'`, `'row'`, `'red'`) pass through
 * unchanged — RN accepts the same raw strings CSS does for these props.
 */
export function parseRawValue(value: string): string {
  return value.trim();
}

/**
 * Warn once per unique `key` against a caller-owned `warned` set. Every "unsupported X dropped"
 * message in this package dedupes through here, so the set's lifetime is what picks the
 * granularity: `compileCssToRules` keeps one per call, `lightning/declarations.ts` one per file.
 */
export function warnOnce(
  warned: Set<string>,
  key: string,
  message: string,
): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

export { REM_TO_PX };
