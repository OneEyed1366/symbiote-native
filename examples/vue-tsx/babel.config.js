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

// The RN preset's dev React-JSX transform injects __self={this} and __source={...} on every
// JSXElement. Under React they are inert dev annotations, but @vue/babel-plugin-jsx copies them
// verbatim into the Vue vnode's PROPS — and at module scope `this` is the Hermes global HostObject.
// Any Vue dev warn then formats that prop for its component trace, the formatter reads
// Symbol.toStringTag off the HostObject, that throws, and the throw unwinds the whole mount → blank
// screen. Strip both attributes on JSXOpeningElement exit: the self/source plugins add them on enter
// (so they exist by exit), and the Vue plugin reads attributes on JSXElement exit, which fires after
// this child-level exit — so the props never carry them.
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

// The Vue JSX pair comes from the adapter, not from a hand-written '@vue/babel-plugin-jsx' entry:
// it is the plugin PLUS the isCustomElement option that makes <View>/<Text> compile to their
// intrinsic tags instead of to a Vue component instance each. Either half alone is broken — see
// @symbiote-native/vue/babel-jsx, which is why they arrive as one require() rather than two lines
// here. @vue/babel-plugin-jsx is a dependency of the adapter now, so a fresh install of a published
// @symbiote-native/vue brings it along; this app's own entry for it is redundant but harmless.
const symbioteVueJsx = require('@symbiote-native/vue/babel-jsx');

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // The Vue JSX pair is listed FIRST so it runs before the RN preset's React-JSX
  // transform: babel applies `plugins` before `presets`, so the Vue plugin rewrites every
  // JSXElement into a @vue/runtime-core createVNode call, leaving no JSX for the React
  // transform to touch (it no-ops). The helper imports it injects come `from 'vue'`, which
  // metro.config.js aliases to @vue/runtime-core, the one Vue runtime the adapter renders on.
  plugins: [...symbioteVueJsx(), stripReactJsxDevAttrs, inlineDebugFlag],
};
