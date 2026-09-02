// The Angular app-side Metro transformer: host-primitive lowering + the CSS pipeline.
//
// Point `metro.config.js`'s `babelTransformerPath` here INSTEAD of `./metro-css-parser`, and do
// NOT also list `./babel-lower-host-primitives` in `babel.config.js` — as a babel plugin it does
// half the job, silently.
//
// WHY a source pre-pass and not a plugin. Angular's linker reads an INLINE template by SLICING THE
// FILE'S SOURCE TEXT at the AST node's own byte range (`templateFromPartialCode` in
// `@angular/compiler-cli`'s bundled linker: `code: this.code`, `range: {startPos, endPos}`), never
// from the string the AST carries. So a plugin that rewrites `template` in the AST is invisible to
// a linker running in the SAME babel pass, while its edit to `dependencies` — read as an ordinary
// AST array — lands. The result is the worst of both: the primitives are gone from `dependencies`
// and the tags are still `<View>`/`<Pressable>`, so they match no directive at all, no component
// template runs, and the screen loses its styles and its press handlers with nothing red anywhere.
//
// Printing the lowered AST back to TEXT before Metro parses it is what makes the two agree: the
// linker then slices the rewritten template out of the source it was handed.
//
// .cjs for the same reason as this package's other loose scripts: Metro `require()`s a
// babelTransformerPath directly, and the package is "type": "module".
const { transformSync } = require('@babel/core');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const {
  createCssMetroTransformer,
  resolveUpstreamTransformer,
} = require('@symbiote-native/css-parser');

const LOWER_PLUGIN_PATH = require.resolve('./babel-lower-host-primitives.cjs');
const lowerHostPrimitives = require(LOWER_PLUGIN_PATH);

// ngc's partial output is the only thing this can act on, and every such file names the declaration
// helper. Cheaper than parsing every file in the bundle to find out it has no component in it.
const PARTIAL_DECLARATION_MARKER = 'ɵɵngDeclareComponent';

function createLoweringTransformer(upstreamTransformer) {
  return {
    transform(params) {
      if (!params.src.includes(PARTIAL_DECLARATION_MARKER)) {
        return upstreamTransformer.transform(params);
      }
      const lowered = transformSync(params.src, {
        filename: params.filename,
        babelrc: false,
        configFile: false,
        plugins: [lowerHostPrimitives],
      });
      return upstreamTransformer.transform({
        ...params,
        src: lowered?.code ?? params.src,
      });
    },
    // Metro's own key covers the upstream transformer and babel.config.js, NOT a plugin this file
    // require()s itself — so editing the lowering rules would otherwise be served from cache and
    // read on device as "the change did nothing".
    getCacheKey(...args) {
      const upstream = upstreamTransformer.getCacheKey?.(...args) ?? '';
      const plugin = createHash('sha1')
        .update(readFileSync(LOWER_PLUGIN_PATH))
        .digest('hex');
      return `${upstream}-symbiote-lower-${plugin}`;
    },
  };
}

module.exports = createCssMetroTransformer(
  createLoweringTransformer(resolveUpstreamTransformer()),
);
module.exports.createLoweringTransformer = createLoweringTransformer;
