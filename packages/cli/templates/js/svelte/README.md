# `templates/js/svelte`

The Svelte JS-level overlay for `@symbiote-native/cli new --framework svelte`. Same seam as
`templates/js/react` (see that folder's README for the full per-file rationale table and what's
deliberately excluded) — source of truth is `examples/svelte`, root-level files only.

`index.js` drops the example's `fabric-call-counter` benchmark instrumentation, same as every
other framework's template. `metro.config.js` keeps every Svelte-specific Metro workaround
verbatim (the `esm-env` DEV redirect, the `browser` condition, `inlineRequires: false`,
`unstable_forceFullRefreshPatterns`) — none of it is canary-specific, all of it is required for
Svelte 5's client runtime to boot under Metro at all.

## `package.json.fragment.json`

Lists only what `index.js`/`metro.config.js`/`babel.config.js` actually import/require:
`@symbiote-native/svelte`, `@symbiote-native/engine`, `svelte`, `react`, `react-native` (deps);
`@react-native/babel-preset`, `@react-native/metro-config` (devDeps). Same scope limitation as
`templates/js/react`'s fragment.
