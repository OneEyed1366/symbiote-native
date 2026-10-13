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

// The dev transform of the RN preset adds `__self` and `__source` to every JSX element
// The Vue JSX plugin copies them into vnode props, where `this` is a Hermes HostObject
// A dev warning then formats it and throws, so both go on the exit of `JSXOpeningElement`
function stripReactJsxDevAttrs() {
  const DEV_ATTRS = new Set(['__self', '__source']);
  return {
    name: 'strip-react-jsx-dev-attrs',
    visitor: {
      JSXOpeningElement: {
        exit(path) {
          path.node.attributes = path.node.attributes.filter(
            attr =>
              !(
                attr.type === 'JSXAttribute' &&
                attr.name.type === 'JSXIdentifier' &&
                DEV_ATTRS.has(attr.name.name)
              ),
          );
        },
      },
    },
  };
}

// The Vue JSX pair comes from the adapter: the plugin plus the `isCustomElement` option
// That option compiles `<view>` and `<text>` to intrinsic tags, not to a component each
const symbioteVueJsx = require('@symbiote-native/vue/babel-jsx');

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // The Vue JSX pair is first, as babel runs `plugins` before `presets`
  // The React transform then finds no JSX, and `vue` is aliased to `@vue/runtime-core` in Metro

  // The worklets plugin has to stay last in this list
  plugins: [
    ...symbioteVueJsx(),
    stripReactJsxDevAttrs,
    inlineDebugFlag,
    'react-native-worklets/plugin',
  ],
};
