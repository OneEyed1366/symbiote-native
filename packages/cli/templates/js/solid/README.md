# `templates/js/solid`

The Solid JS-level overlay for `@symbiote-native/cli new --framework solid`. Same seam as
`templates/js/react` (see that folder's README for the full per-file rationale table and what's
deliberately excluded — App content, `e2e/`, lockfiles, this file itself) — source of truth is
`examples/solid`, root-level files only.

`index.js` drops the example's `fabric-call-counter` benchmark instrumentation (canary-only, not
part of the scaffold seam), same as every other framework's template.

## `package.json.fragment.json`

Lists only what `index.js`/`metro.config.js`/`babel.config.js` actually import/require:
`@symbiote-native/solid`, `@symbiote-native/engine`, `solid-js`, `react`, `react-native`
(deps); `@react-native/babel-preset`, `@react-native/metro-config` (devDeps). Versions pulled
from `examples/solid/package.json` / the packages' own published versions. Same scope
limitation as `templates/js/react`'s fragment — `tsconfig.json`'s `@symbiote-native/css-parser`
and `eslint.config.js`'s `@react-native/eslint-config` aren't listed.
