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
  presets: ['module:@react-native/babel-preset'],
  // The worklets plugin has to stay last in this list
  plugins: [inlineDebugFlag, 'react-native-worklets/plugin'],
};
