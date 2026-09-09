import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

// Lets Vitest import react-native's own Flow source. Green against react-native 0.86.0 on
// 2026-09-10: all 12 tier-A entries import and run. This is a reference copy, not a config anything
// loads - fold `plugins`, `define`, `resolve.extensions` and `setupFiles` into the real one.
//
// Babel is resolved through react-native's OWN require because neither package is a direct
// devDependency here. A real landing declares both rather than leaning on the pnpm store.
const rnRequire = createRequire(require.resolve('react-native/package.json'));
const babel = rnRequire('@babel/core');
const flowStrip = rnRequire.resolve('@babel/plugin-transform-flow-strip-types');
// Babel's own Flow plugin lags Flow's syntax and dies on the conditional type in flattenStyle.
// react-native compiles itself with Hermes' parser; use the same swap.
const hermesSyntax = rnRequire.resolve('babel-plugin-syntax-hermes-parser');

// RN mixes ESM `import` with top-level `require('./X')` in one file (PanResponder:15). Vite's SSR
// transform rewrites the imports and leaves the require, so Node loads the next hop RAW, as Flow -
// and the failure reads as a syntax error in a file the transform was never asked about. Hoisting
// the requires keeps every hop inside the transform.
const requireToImport = ({ types: t }: any) => ({
  visitor: {
    CallExpression(path: any, state: any) {
      if (path.node.callee.name !== 'require') return;
      const [arg] = path.node.arguments;
      if (arg?.type !== 'StringLiteral') return;
      if (path.scope.getBinding('require')) return;
      const ns = path.scope.generateUidIdentifier('req');
      // A namespace object is not callable, so a CJS target (`invariant`) is read through
      // `.default`. But RN writes `require('./X').default` against its own ESM files, where the
      // unwrap is already the caller's - doing it twice yields undefined.
      const reads =
        path.parentPath.isMemberExpression({ computed: false }) &&
        path.parentPath.node.property.name === 'default';
      state.file.path.unshiftContainer(
        'body',
        t.importDeclaration(
          [t.importNamespaceSpecifier(ns)],
          t.stringLiteral(arg.value),
        ),
      );
      path.replaceWith(
        reads
          ? ns
          : t.logicalExpression(
              '??',
              t.memberExpression(ns, t.identifier('default')),
              ns,
            ),
      );
    },
  },
});

export default defineConfig({
  plugins: [
    {
      name: 'strip-flow-from-react-native',
      enforce: 'pre',
      async transform(code: string, id: string) {
        // NOT just `react-native/`: its Flow reaches into sibling @react-native/* packages
        // (normalize-colors is what processTransform, processFilter and processBoxShadow pull).
        if (!/\/node_modules\/(react-native|@react-native\/[^/]+)\//.test(id))
          return null;
        if (!/\.jsx?$/.test(id.split('?')[0])) return null;
        const out = await babel.transformAsync(code, {
          filename: id,
          babelrc: false,
          configFile: false,
          sourceMaps: true,
          plugins: [
            [hermesSyntax, { parseLangTypes: 'flow' }],
            flowStrip,
            requireToImport,
          ],
        });
        return out ? { code: out.code, map: out.map } : null;
      },
    },
  ],
  // RN source reads __DEV__, which Metro defines and nothing here does.
  define: { __DEV__: 'false' },
  // Platform.js re-exports './Platform', which resolves to Platform.ios.js. Metro knows that
  // extension order; Vite does not, and the miss surfaces as a bare "Cannot find module".
  resolve: {
    extensions: ['.ios.js', '.js', '.mjs', '.ts', '.tsx', '.json'],
  },
  test: {
    setupFiles: ['./vitest-rn-globals.setup.ts'],
    server: { deps: { inline: [/react-native/] } },
  },
});
