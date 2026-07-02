// Inline `process.env.DEBUG` at bundle time so @symbiote diagnostic logs can be toggled
// from the shell:
//   DEBUG=1 pnpm start --reset-cache
const debugFlag = process.env.DEBUG === '1' ? '1' : '0';
const angularLinkerModule = require('@angular/compiler-cli/linker/babel');
const angularLinker = angularLinkerModule.default ?? angularLinkerModule;

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
  // Stage B of Angular AOT: Metro sees the partial-Ivy JS emitted by `pnpm ng:build`;
  // the linker turns every ɵɵngDeclareComponent into full Ivy before Hermes sees it.
  plugins: [angularLinker, inlineDebugFlag],
};
