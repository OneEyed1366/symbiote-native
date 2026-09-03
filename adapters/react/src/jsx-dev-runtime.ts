// The dev twin of `./jsx-runtime`, and it has to be its own file rather than an alias of it.
//
// TypeScript resolves the namespace from `<jsxImportSource>/jsx-dev-runtime` whenever `jsx` is
// `react-jsxdev`, and Babel's automatic runtime imports `jsxDEV` — not `jsx`/`jsxs` — from that
// same path in a development build. Solid points both subpaths at one file because its emitted
// runtime is empty either way; ours carries real factories, so the two entries export different
// names and pointing them at one file would leave a dev build importing a `jsxDEV` that is not
// there.
export { jsxDEV } from 'react/jsx-dev-runtime';
export { Fragment } from 'react/jsx-runtime';
export type { JSX } from './jsx-runtime';
