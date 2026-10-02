export function applyRequiredScopes(
  scopes: string[] = [],
  requiredScopes: string[],
): string[] {
  return [...new Set([...scopes, ...requiredScopes])];
}

export function invariantClientId(
  idName: string,
  value: string | undefined,
  providerName: string,
): asserts value is string {
  if (typeof value === 'undefined') {
    throw new Error(
      `Client Id property \`${idName}\` must be defined to use ${providerName} auth on this platform.`,
    );
  }
}
