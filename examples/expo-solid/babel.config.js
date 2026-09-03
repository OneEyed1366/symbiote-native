// Inline `process.env.DEBUG` at bundle time so the @symbiote diagnostic logs can
// be toggled from the shell without a dependency:
//   DEBUG=1 npx react-native start --reset-cache
// The value is read from Metro's own environment when this config is evaluated
// and baked into every transformed module (the app entry and the shared source).
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
    // LISTED LAST, WHICH MAKES IT RUN FIRST - babel applies presets in reverse array order. It has
    // to win the race for the JSX: it rewrites every element into calls imported from
    // @symbiote-native/solid/renderer, and once it has, the RN preset's own React-JSX transform
    // finds no JSX left and no-ops. Swap the order and React's transform claims the elements
    // instead, producing createElement calls no renderer in this app implements.
    //
    // The preset arrives preconfigured (generate:'universal' + the renderer moduleName) from
    // @symbiote-native/solid - see that file for why those two options are not the app's to set.
    '@symbiote-native/solid/babel-preset',
  ],
  plugins: [inlineDebugFlag],
};

// Note on __self/__source: the RN preset's dev transforms add those two attributes to every
// JSXOpeningElement, and (unlike the Vue TSX canary, which needs a plugin to strip them) nothing is
// needed here - they arrive as ordinary props and @symbiote-native/engine's routeProp drops them
// centrally for every adapter. See core/engine/src/node.ts's REACT_JSX_DEV_PROPS.
