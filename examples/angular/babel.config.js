// Inline `process.env.DEBUG` at bundle time so @symbiote diagnostic logs can be toggled
// from the shell:
//   DEBUG=1 pnpm start --reset-cache
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
  plugins: [
    // ngc EMITS STATIC BLOCKS and React Native's preset does not enable the transform for them.
    //
    // `tsconfig.angular.base.json` compiles at ES2022 with `useDefineForClassFields: false` — both
    // deliberate, both Angular's own requirement — and that pair makes TypeScript lower a static
    // property initializer into `static { this.ɵfac = … }`. RN's preset carries the other class
    // features but not this one, and `@babel/helper-create-class-features-plugin` refuses a class
    // that mixes them: `Static class blocks are not enabled`. It surfaces in a RELEASE bundle, where
    // the class-features transform runs, and is invisible to every headless check in this repo.
    //
    // First in the list so the class body is plain by the time the two plugins below read the
    // `ɵɵngDeclare*` calls out of it.
    require('@babel/plugin-transform-class-static-block'),
    // Runs before the linker, as it reads `selector` off the partial `ɵɵngDeclareComponent`
    // It then calls `registerComposedComponent` for every composed component in the bundle
    require('@symbiote-native/angular/babel-register-composed'),
    // Stage B of Angular AOT: Metro sees the partial-Ivy JS emitted by `pnpm ng:build`;
    // @symbiote-native/angular's linker turns every ɵɵngDeclareComponent into full Ivy before
    // Hermes sees it.
    require('@symbiote-native/angular/babel-linker'),
    inlineDebugFlag,
    // Has to stay last in this list
    'react-native-worklets/plugin',
  ],
};
