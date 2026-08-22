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
  presets: ['module:@react-native/babel-preset'],
  plugins: [inlineDebugFlag],
  // @react-native/babel-preset hardcodes its own @babel/plugin-transform-typescript call with no
  // allowDeclareFields, so `declare context: ContextType<...>` (the official React docs' own class-
  // component context typing idiom, used by ContextProviderDemo.tsx) throws at build time. Running our
  // own TS transform first, with the flag on, strips the declare field before the preset's copy sees it.
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
