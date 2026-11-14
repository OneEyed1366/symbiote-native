// Inline `process.env.DEBUG` at bundle time so the @symbiote diagnostic logs can
// be toggled from the shell without a dependency:
//   DEBUG=1 npx expo start --web --clear
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
  presets: ['module:@react-native/babel-preset'],
  plugins: [inlineDebugFlag],
  // Same allowDeclareFields pass as the native canary: the preset's own TS transform rejects
  // `declare` class fields, which ContextProviderDemo.tsx uses.
  overrides: [
    {
      test: /\.tsx?$/,
      plugins: [
        [
          require.resolve('@babel/plugin-transform-typescript'),
          { isTSX: true, allowNamespaces: true, allowDeclareFields: true },
        ],
      ],
    },
  ],
};
