// Inlines `process.env.DEBUG` at bundle time, so diagnostic logs toggle from the shell
//   DEBUG=1 npx react-native start --reset-cache
// Metro reads the environment when this config is evaluated, then bakes it into every module
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

// Bundle Mode keeps worklets out of `eval`, which on Hermes V1 costs about 0.5 MB per function
// It needs `bundleModeMetroConfig` in metro.config.js as well
const workletsPluginOptions = { bundleMode: true };

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // The worklets plugin has to stay last in this list
  plugins: [
    inlineDebugFlag,
    ['react-native-worklets/plugin', workletsPluginOptions],
  ],
  // The preset's TS transform lacks `allowDeclareFields`, so a `declare` field breaks the build
  // Our copy runs first with the flag on and strips it, as `declare context` needs in the demo
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
