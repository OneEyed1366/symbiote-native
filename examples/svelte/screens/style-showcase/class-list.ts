// Written out, not hidden in a helper, since the readout under each dynamic tile prints this string
export function classList(
  base: string,
  modifiers: Record<string, boolean>,
): string {
  const on = Object.keys(modifiers).filter(name => modifiers[name]);
  return [base, ...on].join(' ');
}
