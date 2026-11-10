// Reanimated brings a native half, so the app needs its pods and a rebuild after the install
// A manual babel step is only listed when the app's config had no plugins list to extend
export function reanimatedNotes(hasManualBabelStep: boolean): string[] {
  return [
    '',
    'Reanimated has a native half: run "pod install" in ios/ and rebuild the app.',
    ...(hasManualBabelStep
      ? [
          'Add "react-native-worklets/plugin" as the LAST entry of `plugins` in your babel.config.js.',
        ]
      : []),
  ];
}
