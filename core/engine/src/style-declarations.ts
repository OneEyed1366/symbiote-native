// Whether a style declares a custom property (`--x`), the host's cue to scan it
// Memoized per object, so a hoisted style or a resolved class is scanned once

const CUSTOM_PROPERTY_PREFIX = '--';

const scanned = new WeakMap<object, boolean>();

function isCustomPropertyKey(key: string): boolean {
  return (
    key.startsWith(CUSTOM_PROPERTY_PREFIX) &&
    key.length > CUSTOM_PROPERTY_PREFIX.length
  );
}

export function declaresVariables(style: unknown): boolean {
  if (typeof style !== 'object' || style === null) return false;
  const known = scanned.get(style);
  if (known !== undefined) return known;
  const found = Array.isArray(style)
    ? style.some(declaresVariables)
    : Object.keys(style).some(isCustomPropertyKey);
  scanned.set(style, found);
  return found;
}
