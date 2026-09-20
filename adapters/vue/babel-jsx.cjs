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
// `isCustomElement` is the load-bearing option: without it `<view>` compiles to
// `resolveComponent("view")`, a component that resolves to nothing, with SLOT children an element
// path never mounts. Blank subtree, no error.
//
// @vue/babel-plugin-jsx is OUR dependency and require() resolves relative to this file, so the app
// declares no extra devDependency — same reasoning as ./metro-css-parser.cjs.
//
// `optimize: true` defaults ON, an app may override it. The plugin's own README calls it
// experimental ("the optimized code may skip certain re-renders... we strongly recommend thorough
// testing") because it generates PatchFlags/dynamicProps from JSX's syntax alone, without the
// template compiler's data-flow analysis. `.vue` SFCs get the equivalent from `@vue/compiler-sfc`
// unconditionally already (`metro-vue-transformer.cjs`) — this closes the same gap for TSX, which
// had none. `vue-row-component-shape-cost.itest.ts` measured why it matters: a stateful component
// re-render pays for `hasPropsChanged`'s full `Object.keys(nextProps)` walk on every patch, even
// when nothing changed; a patchFlag lets Vue check only the flagged dynamic keys instead.
// Correctness (a changed prop still recommits, a conditional branch still flips, a keyed list still
// reorders, and — the shape that actually matters here — a child COMPONENT still re-renders when a
// nested prop field changes) is pinned in `optimize-flag-safety.test.ts`, including the exact
// stateful-row shape the itest above measures; that file also confirms a measurable, reproducible
// JS-side speedup on the identical partial-relabel pattern. NOT verified on-device/Hermes — only
// headless, through this adapter's real renderer.
const vueJsx = require('@vue/babel-plugin-jsx');

// An intrinsic the renderer resolves through descriptorFor, never a Vue component — including one
// an app writes by hand. A CLOSED set and not a prefix or shape test: an app's own kebab-case
// component looks identical to ours since the `symbiote-` marker was dropped, and answering true
// for it would stop resolving it with nothing red.
const INTRINSIC_TAGS = require('./intrinsic-tags.cjs');

function isSymbioteIntrinsic(tag) {
  return INTRINSIC_TAGS.has(tag);
}

module.exports = function symbioteVueJsx(options = {}) {
  return [
    [
      vueJsx,
      {
        // A default an app may override — see the file-level comment above for what backs it.
        optimize: true,
        ...options,
        // Last, deliberately: an app may pass other @vue/babel-plugin-jsx options through, but
        // overriding this one silently produces output this adapter cannot render.
        isCustomElement: isSymbioteIntrinsic,
      },
    ],
  ];
};
