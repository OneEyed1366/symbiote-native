// Derives the RN AppRegistry component key from the user-typed app name — this is what Android's
// getMainComponentName(), iOS's AppDelegate withModuleName:, and app.json's "name"/"displayName"
// all reference as a bare identifier, so (unlike the npm package name) it can't contain hyphens
// or start with a digit. Mirrors `react-native init`'s own PascalCase sanitization; also doubles
// as the on-device launcher label (matching upstream RN CLI: "AwesomeProject" IS the home-screen
// text too, not reformatted with spaces).
export function sanitizeNativeAppName(appName: string): string {
  const words = appName.match(/[a-zA-Z0-9]+/g) ?? [];
  const pascalCase = words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  return pascalCase === '' || /^[0-9]/.test(pascalCase)
    ? `App${pascalCase}`
    : pascalCase;
}

export function defaultBundleId(nativeAppName: string): string {
  return `com.${nativeAppName.toLowerCase()}`;
}

// Android's package-name rules (reverse-DNS, alphanumeric + dot, no dashes) are the stricter of
// the two platforms' — iOS additionally allows dashes — so validating against Android's rule
// keeps one bundle id valid on both.
const BUNDLE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export function isValidBundleId(value: string): boolean {
  return BUNDLE_ID_PATTERN.test(value);
}
