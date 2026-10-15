// Inlines `process.env.DEBUG` at bundle time, so the diagnostic logs toggle from the shell
//   DEBUG=1 npx react-native start --reset-cache
// Metro's environment is read when this config is evaluated, then baked into every module
const debugFlag = process.env.DEBUG === '1' ? '1' : '0';

function inlineDebugFlag({ types: t }) {
  return {
    name: 'inline-debug-flag',
    visitor: {
      MemberExpression(path) {
        if (path.matchesPattern('process.env.DEBUG')) {
          path.replaceWith(t.stringLiteral(debugFlag));
        }
      },
    },
  };
}

module.exports = {
  presets: [
    'module:@react-native/babel-preset',
    // LISTED LAST, WHICH MAKES IT RUN FIRST — babel applies presets in reverse array order. It has
    // to win the race for the JSX: it rewrites every element into calls imported from
    // @symbiote-native/solid/renderer, and once it has, the RN preset's own React-JSX transform
    // finds no JSX left and no-ops. Swap the order and React's transform claims the elements
    // instead, producing createElement calls no renderer in this app implements.
    //
    // The preset arrives preconfigured (generate:'universal' + the renderer moduleName) from
    // @symbiote-native/solid — see that file for why those two options are not the app's to set.
    '@symbiote-native/solid/babel-preset',
  ],
  // The worklets plugin has to stay last in this list
  plugins: [inlineDebugFlag, 'react-native-worklets/plugin'],
};

// The RN preset's dev transforms add `__self` and `__source` to every JSX opening element
// Nothing strips them here, as `routeProp` of the engine drops them for every adapter
// See `REACT_JSX_DEV_PROPS` in core/engine/src/node.ts
