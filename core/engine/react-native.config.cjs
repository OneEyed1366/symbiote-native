// Declares this package's Android native project to @react-native-community/cli autolinking.
// Explicit rather than relying on auto-detection, so the Kotlin ReactPackage is registered
// deterministically — same reasoning as `packages/android/react-native.config.js`.
//
// `ios` is deliberately ABSENT rather than null: the iOS half is a real podspec
// (`symbiote-engine.podspec`) that CocoaPods autolinking already finds, and naming the key would
// only give us a chance to get it wrong.
//
// `.cjs`, not `.js`: this package is `"type": "module"`, so a `.js` file using `module.exports`
// would be loaded as ESM and throw. The CLI searches `react-native.config.js`,
// `react-native.config.cjs` and `react-native.config.ts` (cli-config's `searchPlacesForCJS`), so the
// extension costs nothing.
module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import dev.symbiotenative.engine.SymbioteEnginePackage;',
        packageInstance: 'new SymbioteEnginePackage()',
      },
    },
  },
};
