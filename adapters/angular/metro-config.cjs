// Angular's AOT pipeline needs ONE Metro-side accommodation beyond the plain css-parser
// transformer: ngc mirrors this app's whole source tree into its own outDir (see
// tsconfig.angular.base.json's `outDir` convention, "build/angular" by default) but only ever
// compiles .ts — a relative non-script import (`import './App.css'`, `require('./assets/logo.png')`)
// survives untouched in the compiled .js, still pointing at the ORIGINAL source location, which
// ngc never copies there. Metro resolves that relative specifier against the COMPILED file's own
// location (<outDir>/...), so without this it 404s on a file that was never created there — a
// device-diagnosed 2026-09-18 case: `Unable to resolve module ./assets/react-native-logo.png`
// from a component that ships a bundled image `require()`, same failure shape as the CSS case
// this originally shipped for, just a different extension. This redirects the resolution ORIGIN
// back to the real source directory and lets Metro's own resolver take it from there (its usual
// sourceFile/assetFile decision, including @2x/@3x density-variant lookup for images) — cheaper
// and more general than hand-rolling either resolution shape here, and it generalizes to ANY
// non-script asset ngc doesn't copy, not just the two extensions someone happened to hit first.
// A real copy would need its own re-copy on every source edit during `ngc --watch` (which only
// re-runs on .ts changes), while this redirect lets Metro's own watchFolders pick up a source
// edit for free. Applies identically to a release `react-native bundle`, which resolves through
// this same config.
//
// watchFolders/extraNodeModules are intentionally NOT included here — those are monorepo-only
// pnpm-workspace concerns (deduping a single react/@angular/core copy across packages), not
// relevant to an external app installing @symbiote-native/angular from npm; a consumer keeps
// those local to their own metro.config.js if it needs them at all.
const path = require('node:path');

function withSymbioteAngularMetroConfig(
  defaultConfig,
  projectRoot,
  { outDir = 'build/angular' } = {},
) {
  const buildRoot = path.join(projectRoot, ...outDir.split('/'));

  return {
    resolver: {
      // Teach Metro that a style file is a source file (the transformer above turns it into a
      // module). scss/sass/less/styl are optional preprocessor sources, reduced to plain CSS
      // before the same transformer runs.
      sourceExts: [
        ...defaultConfig.resolver.sourceExts,
        'css',
        'scss',
        'sass',
        'less',
        'styl',
      ],
      resolveRequest: (context, moduleName, platform) => {
        // ngc only ever emits .ts -> .js into buildRoot (and a bare extensionless specifier is
        // always a real compiled module, e.g. `./MenuScreen`) — anything else with a relative
        // specifier and an extension is a non-script file ngc never copied there.
        const isRelativeNonScriptImport =
          /^\.\.?\//.test(moduleName) &&
          path.extname(moduleName) !== '' &&
          !/\.(ts|tsx|js|jsx)$/.test(moduleName);
        if (isRelativeNonScriptImport) {
          const originDir = path.dirname(context.originModulePath);
          if (
            originDir === buildRoot ||
            originDir.startsWith(buildRoot + path.sep)
          ) {
            const sourceDir = path.join(
              projectRoot,
              path.relative(buildRoot, originDir),
            );
            const fakeOrigin = path.join(
              sourceDir,
              path.basename(context.originModulePath),
            );
            return context.resolveRequest(
              { ...context, originModulePath: fakeOrigin },
              moduleName,
              platform,
            );
          }
        }
        return context.resolveRequest(context, moduleName, platform);
      },
    },
  };
}

module.exports = { withSymbioteAngularMetroConfig };
