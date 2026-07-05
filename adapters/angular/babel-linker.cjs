// Normalizes @angular/compiler-cli/linker/babel's export shape — depending on how a
// consumer's Metro/Babel setup loads it, the plugin lands as either the plugin function itself
// or a `{ default: plugin }` wrapper — so a consumer's babel.config.js just requires this
// instead of re-deriving the `.default ?? angularLinker` fallback itself.
const angularLinkerModule = require('@angular/compiler-cli/linker/babel');

module.exports = angularLinkerModule.default ?? angularLinkerModule;
