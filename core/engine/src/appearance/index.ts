// The runtime is RN's own `Appearance`, forwarded through `react-native-host`

// `setColorScheme('unspecified')` resets to the system value, and a read yields 'unspecified' only
// when native has no system scheme to give back
export type IColorSchemeName = 'light' | 'dark' | 'unspecified';
export type IColorSchemePreference = IColorSchemeName;
