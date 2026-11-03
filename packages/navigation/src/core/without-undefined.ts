// Native reads a key that is present, so an unset option must not reach the props at all
export function withoutUndefined(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) kept[key] = value;
  }
  return kept;
}
