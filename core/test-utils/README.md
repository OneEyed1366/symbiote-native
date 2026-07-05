# @symbiote-native/test-utils

The **shared fake-Fabric test harness** of [SymbioteNative](../../README.md) — one
`installFabric()` that puts a fresh, faithful fake `nativeFabricUIManager` on `globalThis` and
returns a handle to inspect what a renderer committed. It replaces the per-file fake slot every
headless test used to copy-paste (×65 across the repo) with one implementation, shared by the
engine, every adapter, and the example apps' own colocated `vitest` suites.

> New to SymbioteNative? The [root README](../../README.md) has the architecture and the
> [Testing](../../README.md#testing) section this package's harness is the foundation of.

---

## Install

Nearly every consumer gets this as a `devDependency`, alongside `vitest`:

```bash
npm install -D @symbiote-native/test-utils
```

---

## Use it

```ts
import { installFabric } from '@symbiote-native/test-utils';

test('tap increments the counter', () => {
  const fabric = installFabric();
  mount(1, createElement(App));

  const button = fabric.find((n) => n.viewName === 'RCTView' && n.props.testID === 'tap-target');
  fabric.fireEvent(button!.instanceHandle, 'topClick', {});

  expect(fabric.serialize(fabric.committed)).toContain('Taps: 1');
});
```

Each test calls `installFabric()` fresh (or `.reset()` an existing handle between assertions in the
same test) — the fake slot is a `globalThis` singleton, so a stale handle from a previous test would
otherwise leak state into the next one.

## What `installFabric()` gives you

- **`committed`** — the child set from the most recent `completeRoot`, and **`appRoot()`** — unwraps
  RN's synthetic `box-none` AppContainer root so a test doesn't re-check that invariant by
  hand.
- **`created`** and **`find(predicate)`** — every node ever `createNode`'d this run (clones
  excluded), and a lookup by predicate (e.g. "the app's own `View` with this `testID`").
- **`fireEvent(handle, topLevelType, nativeEvent?)`** — delivers a native event to whatever handler
  the renderer registered, the same `instanceHandle` round-trip real Fabric does.
- **`commands`** and **`counts`** — every imperative command dispatched at a committed node, and
  call counters (`createNode` / `completeRoot`) for tests asserting "exactly N native nodes".
- **`serialize(nodes)`** — a committed tree as `RCTView(RCTText(RCTRawText "text"))` shorthand, for
  a one-line snapshot instead of walking `IFakeNode` by hand.
- **`reset()`** — zeroes the counters and clears `committed`/`created` (the registered event handler
  survives), for reusing one `installFabric()` call across several assertions in one test.

The fake's persistence semantics are **faithful to real Fabric**, not simplified: every clone gets a
new identity, `clone*WithNewProps` **merges** the diff onto the previous props exactly like native
Fabric does with the engine's minimal-diff payload (a removed key arrives as literal `null` and
stays `null`, so a test can tell "explicitly reset" apart from "never set"), and `appendChild`
throws on an illegal family reparent. A persistence bug in the fake is fixed once, here, for every
test that depends on it.

## What it does NOT do

- It is not a mocking framework — there's nothing to configure beyond calling `installFabric()`;
  the fake always behaves like real Fabric's clone-on-write contract.
- It does not stand in for on-device verification — see [Testing](../../README.md#testing) for how
  this headless layer and the on-device `Detox` layer divide the work.

## Related packages

- [`@symbiote-native/engine`](../engine) — the package whose commit path this fake stands in for;
  every adapter's headless test drives the real engine against this fake slot instead of real Fabric.

## Test it

This package has no tests of its own — it *is* the test double every other package's `vitest` suite
imports.
