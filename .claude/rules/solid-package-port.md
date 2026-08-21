---
paths:
  - 'packages/*/src/solid/**'
---

# A Solid primitive freezes at its first reading — and nothing reports it

A Solid body runs ONCE. Every bug in this layer is the same one: something was read
as a VALUE where it had to stay an accessor. `tsc` cannot see it (`solid-js`'s
`JSX.Element` is `any` in a DOM-less program), and a test that asserts only the first
value passes.

Must-apply, measured bringing all 13 packages to Solid:

- Bucket `primitives/`. `create*` when it owns state or a subscription, `use*` when it
  consumes existing context (`useRoute`, `useNavigation`). Per function, not per package.
- Return `Accessor<T>`. Subscribe SYNCHRONOUSLY in the body + `onCleanup` — never an
  `onMount`/`useEffect` equivalent.
- An **async** seed racing that synchronous subscribe must not clobber a newer event:
  flag it in the listener, drop the seed. A synchronous native read has no race — do
  not add the guard for symmetry.
- A scalar a body would re-read (interval, threshold) takes `MaybeAccessor`
  (`T | Accessor<T | undefined> | undefined`), applied `untrack`ed before subscribing,
  then `createEffect(on(…, { defer: true }))`.
- No `.tsx` here — the package tsconfig carries `jsx: react-jsx` for its React entry.
- Barrel: copy the SIBLING barrel's export breadth, do not apply `export * from '../core'`
  blindly. A component package starts with a bare `import '../register';`.
- Prove each guard non-vacuous by breaking it and matching the failure count.

Four ownership traps (empty collector registry at body time · interleaved marker
writes · wrong owner in a memo declared outside a Provider · an inert lazily-cached
node handed to a re-running effect), when a render fn CANNOT go through
`descriptorToSolid`, and the full wiring checklist:
**invoke the `symbiote-solid-package-port` skill.**

Rendering-side traps are a separate list — see `solid-descriptor-bridge.md`.
