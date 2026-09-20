// Inline `process.env.DEBUG` at bundle time so the @symbiote diagnostic logs can
// be toggled from the shell without a dependency:
//   DEBUG=1 npx react-native start --reset-cache
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
    // finds no JSX left and no-ops.
    '@symbiote-native/solid/babel-preset',
  ],
  plugins: [inlineDebugFlag],
};
