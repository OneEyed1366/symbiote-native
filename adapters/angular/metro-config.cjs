// Angular's AOT pipeline needs ONE Metro-side accommodation beyond the plain css-parser
// transformer: ngc mirrors this app's whole source tree into its own outDir (see
// tsconfig.angular.base.json's `outDir` convention, "build/angular" by default) but only ever
// compiles .ts — a relative style import (`import './App.css'`) survives untouched in the
// compiled .js, still pointing at the ORIGINAL source location, which ngc never copies there.
// Metro resolves that relative specifier against the COMPILED file's own location
// (<outDir>/...), so without this it 404s on a file that was never created there. This redirects
// such an import back to the real source file instead of copying it — a copy would need its own
// re-copy on every CSS edit during `ngc --watch` (which only re-runs on .ts changes), while this
// redirect lets Metro's own watchFolders pick up a source-file CSS edit for free. Applies
// identically to a release `react-native bundle`, which resolves through this same config.
//
// watchFolders/extraNodeModules are intentionally NOT included here — those are monorepo-only
// pnpm-workspace concerns (deduping a single react/@angular/core copy across packages), not
// relevant to an external app installing @symbiote-native/angular from npm; a consumer keeps
// those local to their own metro.config.js if it needs them at all. See the
// symbiote-sfc-style-compiler and angular-adapter-build skills.
const fs = require('node:fs');
const path = require('node:path');

function withSymbioteAngularMetroConfig(defaultConfig, projectRoot, { outDir = 'build/angular' } = {}) {
  const buildRoot = path.join(projectRoot, ...outDir.split('/'));

  return {
    resolver: {
      // Teach Metro that a style file is a source file (the transformer above turns it into a
      // module). scss/sass/less/styl are optional preprocessor sources — see
      // core/css-parser/src/preprocessors.ts.
      sourceExts: [...defaultConfig.resolver.sourceExts, 'css', 'scss', 'sass', 'less', 'styl'],
      resolveRequest: (context, moduleName, platform) => {
        const isRelativeStyleImport =
          /^\.\.?\//.test(moduleName) && /\.(css|scss|sass|less|styl)$/.test(moduleName);
        if (isRelativeStyleImport) {
          const originDir = path.dirname(context.originModulePath);
          if (originDir === buildRoot || originDir.startsWith(buildRoot + path.sep)) {
            const sourceDir = path.join(projectRoot, path.relative(buildRoot, originDir));
            const sourceFile = path.resolve(sourceDir, moduleName);
            if (fs.existsSync(sourceFile)) {
              return { type: 'sourceFile', filePath: sourceFile };
            }
          }
        }
        return context.resolveRequest(context, moduleName, platform);
      },
    },
  };
}

module.exports = { withSymbioteAngularMetroConfig };
