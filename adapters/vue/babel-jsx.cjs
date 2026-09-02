// The Babel plugins a Vue TSX/JSX app puts in its babel.config.js, as ONE list:
//
//   const symbioteVueJsx = require('@symbiote-native/vue/babel-jsx');
//   module.exports = {
//     presets: ['module:@react-native/babel-preset'],
//     plugins: [...symbioteVueJsx(), myOtherPlugin],
//   };
//
// A list rather than a preset, on purpose. `@vue/babel-plugin-jsx` MUST run before the RN preset's
// React-JSX transform claims the same JSXElements, and Babel applies `plugins` before `presets` —
// so it has to stay in the app's plugins array, where the app also controls its position relative
// to its own plugins. A preset would move it after every plugin and silently change that order.
//
// The two entries are handed out together because either alone is broken:
//
//   lowering only        -> `symbiote-view` compiles to resolveComponent("symbiote-view"), a
//                           component that resolves to nothing, with SLOT children an element path
//                           never mounts. Blank subtree, no error.
//   isCustomElement only -> nothing was rewritten, so <View> is still a Vue component and the whole
//                           point (one component instance per node on ~73% of the tree) is unpaid.
//
// Same "both halves or nothing" invariant the SFC path states in metro-vue-transformer.cjs, and the
// reason it is expressed as one require() here rather than two lines of documentation.
//
// @vue/babel-plugin-jsx is OUR dependency and require() resolves relative to this file, so the app
// declares no extra devDependency — same reasoning as ./metro-css-parser.cjs.

const vueJsx = require('@vue/babel-plugin-jsx');
const lowerHostPrimitives = require('./babel-lower-host-primitives.cjs');

// Every `symbiote-*` tag is an intrinsic the renderer resolves through descriptorFor, never a Vue
// component — including one an app writes by hand, which is why this is a prefix test rather than a
// list of the two tags the lowering emits.
const SYMBIOTE_TAG_PREFIX = 'symbiote-';

function isSymbioteIntrinsic(tag) {
  return tag.startsWith(SYMBIOTE_TAG_PREFIX);
}

module.exports = function symbioteVueJsx(options = {}) {
  return [
    lowerHostPrimitives,
    [
      vueJsx,
      {
        ...options,
        // Last, deliberately: an app may pass other @vue/babel-plugin-jsx options through, but
        // overriding this one silently produces output this adapter cannot render.
        isCustomElement: isSymbioteIntrinsic,
      },
    ],
  ];
};
