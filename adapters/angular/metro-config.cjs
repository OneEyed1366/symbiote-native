// ngc compiles only .ts into outDir; a relative non-script import (`./App.css`, a bundled asset
// like `./logo.png`) still points at the original source path, so Metro 404s resolving it against
// the compiled file's location. Redirect the origin back to the source dir instead.
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
