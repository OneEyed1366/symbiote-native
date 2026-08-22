---
name: symbiote-solid-package-port
description: "Porting a package's per-framework entry to Solid (`packages/<pkg>/src/solid/`), or writing any Solid lifecycle primitive over the engine. Covers the naming rule (`primitives/` + `create*`, but `use*` for context consumers), the four ownership/timing traps that are INVISIBLE to tsc and to a passing test suite (empty collector registry, interleaved marker writes, wrong owner inside a memo declared outside a Provider, an inert lazily-cached node handed to a re-running effect), the MaybeAccessor convention for scalar params, the seed-vs-event race a synchronous subscribe creates, and when a render fn CANNOT go through descriptorToSolid. Measured while bringing all 13 packages to Solid, 2026-08-19. Trigger on: adding src/solid to a package, writing a create* primitive, a Solid value that mysteriously freezes at its mount-time reading, or `useRoute`/context throwing inside a navigator."
---

# Porting a package to Solid — what a body that runs ONCE breaks

Every other adapter re-runs a component body. Solid does not. So the whole class of
bugs below is the same bug wearing different clothes: **something was read as a
value where it had to stay an accessor**, and the symptom is not a crash — it is a
correct-looking screen frozen at its first reading.

None of it is visible to `tsc`. `solid-js`'s `JSX.Element` is silently `any` in a
DOM-less program (`.claude/rules/solid-jsx-namespace.md`), so a whole child position
can go unchecked. A test that only asserts the FIRST value passes too.

## 1. Naming — per function, not per package

Bucket is `primitives/`. Then, per function:

| Owns state or a subscription                                        | Consumes something that already exists            |
| ------------------------------------------------------------------- | ------------------------------------------------- |
| `create*`                                                           | `use*`                                            |
| `createBatteryLevel`, `createIsFocused`, `createLinkingIntegration` | `useNavigation`, `useRoute`, `useStackNavigation` |

Solid reserves `use*` for `useContext` / `useTransition`. Applying `create*` as a
blanket rename is as wrong as leaving `use*` everywhere. The rationale lives in
`adapters/solid/src/primitives/create-color-scheme.ts`'s header.

## 2. Subscribe synchronously, and mind the seed you race

React and Vue subscribe from an effect, a tick after seeding. Solid does both in one
synchronous tick, which CLOSES that race — say so in a comment where it applies.

But a synchronous subscribe opens a different one wherever the seed is **async**:

```
addListener()          t0   synchronous
event arrives          t1   the NEWER value
getXAsync() resolves   t2   the OLDER value, and it wins
```

React and Vue let last-write-win, where the writers are ordered by latency rather
than by time. Do not copy that. Set a flag in the listener and drop the seed:

```ts
let hasNativeReading = false;
const subscription = addBatteryLevelListener(event => {
  hasNativeReading = true;
  setLevel(event.batteryLevel);
});
getBatteryLevelAsync().then(level => {
  if (!hasNativeReading) setLevel(level);
});
```

A **synchronous** native read (localization's `getLocales()`) has no race at all —
do not add the guard there just for symmetry.

## 3. Scalar params take `MaybeAccessor`

A param a component body would re-read on every render (a sensor's update interval,
a threshold, a page size) freezes at mount if typed as a plain scalar.

```ts
type IUpdateIntervalMs = number | Accessor<number | undefined> | undefined;
```

solid-primitives' convention: the literal keeps the call site identical to React/Vue
for the static case, the accessor is the only form that survives. Apply it in two
halves — the mount-time value read `untrack`ed and applied **before** subscribing
(so the first native sample is already at the right rate, and a primitive built in a
tracked scope does not re-subscribe), then `createEffect(on(accessor, …, { defer: true }))`
for later changes. Without `defer` the value is applied twice at mount.

Do NOT re-create the subscription on such a change unless the native side actually
requires it. React's effect keys on the interval and re-subscribes; the native
listener is rate-independent, so copying that just drops events.

## 4. The four ownership/timing traps

Measured on `packages/navigation`. Each was green under `tsc` and produced a
plausible screen.

### 4a. The collector registry is EMPTY when the navigator body runs

Solid cannot inspect its children. Markers (`<Screen>`) register from their OWN
bodies, inside the collector Provider — i.e. **after** the navigator body returned.

So a navigator must not seed from the registry at body time. A route minted before
its marker exists is stranded permanently, because `<For>` maps a key exactly once.
Return a memo that yields nothing until the plan resolves; never bail early.

### 4b. Markers register with SEPARATE signal writes, and a memo can run between them

A one-shot seed reliably captures only the FIRST screen — every later `jumpTo` then
runs against a one-route router and silently no-ops.

Fix: re-derive the initial state from the registry until the first dispatch, then
freeze the list (matching React/Vue). Safe only because route keys are name-derived,
so the derivation is pure. State that reason where you rely on it.

### 4c. A component created inside a memo DECLARED OUTSIDE a Provider gets the wrong owner

It sees no context — `useRoute()` throws. Create the body inside the Provider's own
`children` getter: tracked read of `component()`, `untrack`ed build.

### 4d. A lazily-cached node handed back to a RE-RUNNING effect is inert

The first caller **owns** every memo the subtree created, and disposes them when it
re-runs. The node is still there and still mounted; it simply stops updating.

Fix: a dependency-free `createMemo` — it gives both exactly-once and a stable owner.

## 5. When a render fn cannot go through `descriptorToSolid`

The bridge requires a SHAPE-STABLE descriptor (same type, same child count). A render
fn whose child count flips with a feature — slider's step overlay, any conditional
sibling — violates trap §2 and throws.

Do not loosen the contract. Split it:

1. assemble the stable wrapper by hand (`createElement` / `spread` / `insert` off
   `@symbiote-native/solid/renderer`),
2. bridge the native leaf ONCE through `descriptorToSolid`,
3. put only the varying part behind a rebuild boundary — `createMemo` on a signature
   of exactly what changes its shape, built `untrack`ed (trap §5).

Net effect is better than the reference: the native node survives every change to the
varying part, where React remounts it. Keep the `insert` order deliberate — it is
z-order.

## 6. Barrels — copy the SIBLING, not the rule

`src/solid/index.ts` normally ends with `export * from '../core';`. But where the
react/vue/svelte barrels deliberately export a NARROWER set (splash-screen exports
only `hide` / `isVisible` + its public types), `export *` leaks internals from
`/solid` alone and breaks the very parity the rule exists to protect. Check the
siblings before applying it.

A component package's barrel must start with a bare `import '../register';` —
never a re-export. CLAUDE.md's note on Metro `inlineRequires` explains why a
re-export becomes a lazy getter that never evaluates, in RELEASE builds only.

## 7. Proving the test is not vacuous

Every guard above passes trivially if the test only reads the first value. Break the
mechanism, confirm the EXPECTED test fails and the count matches, revert:

| Break                                       | Must fail                                            |
| ------------------------------------------- | ---------------------------------------------------- |
| snapshot the route instead of a memo        | the `setParams` reaches-a-mounted-screen test        |
| `<For each={routes}>` instead of route keys | the does-not-rebuild-the-subtree test (node counter) |
| freeze to the build-time plan               | the live-options-repaint test                        |
| `equals: () => true` on a rebuild boundary  | the presentation-flip test                           |
| drop the seed guard of §2                   | the ordering test, and ONLY it                       |
| move a subscribe into `createEffect`        | the subscribes-synchronously test                    |

Assert teardown by the accessor going STILL after dispose, not by spying on
`remove` — the spy passes when the subscription was never live.

## 8. Wiring checklist

- `package.json`: `exports["./solid"]`, `publishConfig.exports["./solid"]`,
  `@symbiote-native/solid` + `solid-js` as peers with BOTH `optional` in
  `peerDependenciesMeta`, both in devDeps (`workspace:*` / `catalog:`), description.
- `tsconfig.json`: `{ "path": "../../adapters/solid" }` in `references`.
- No `.tsx` in a package's `src/solid/`: the package's single tsconfig carries
  `jsx: react-jsx` for its React entry, and TS has one `jsx` setting per program, so
  a `.tsx` would be checked against React's JSX namespace. Write plain `.ts`.
- Root `tsconfig.json` and `vitest.config.ts` already know about solid
  (`packages/**/src/solid/**/*.test.{ts,tsx}` is in the solid vitest project).
  Nothing to add there.
