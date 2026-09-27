# @symbiote-native/test-utils

The **shared fake-Fabric test harness** of [SymbioteNative](../../README.md) — one
`installRecordingFabric()` that puts a fresh, faithful fake `nativeFabricUIManager` on
`globalThis` and returns a handle recording what a renderer did. It replaces the per-file fake
slot every headless test used to copy-paste (×65 across the repo) with one implementation, shared
by the engine, every adapter, and the example apps' own colocated `vitest` suites.

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
import { installRecordingFabric } from '@symbiote-native/test-utils';

const fabric = installRecordingFabric();

test('tap increments the counter', () => {
  mount(1, createElement(App));

  const button = fabric.find(
    n => n.viewName === 'RCTView' && n.props.testID === 'tap-target',
  );
  fabric.fireEvent(button!.instanceHandle, 'topClick', {});

  expect(fabric.propsOf(button!.handle).testID).toBe('tap-target');
  fabric.reset();
});
```

Call `installRecordingFabric()` ONCE per test file, at module scope, and `.reset()` the handle
between tests. Do not re-install per test: the engine's `getSlot()` (`core/engine/src/fabric.ts`)
reads the slot's methods once and caches them for the process lifetime, so a second
`installRecordingFabric()` after anything has committed swaps the global while the engine keeps
writing through the handle it already bound — the new recorder just stays empty, with nothing to
signal why. File-level isolation comes from the test runner; `reset()` is what separates tests
within a file.

## What `installRecordingFabric()` gives you

- **`find(predicate)`** and **`findAll(predicate)`** — every AUTHORED node the ops ever named
  (clones excluded), searched in CREATION order. This is the creation LOG, not a live tree: a node
  the app removed still answers `find` — see "Reading the live tree" below for a residency
  question ("is this still mounted") the log can't answer.
- **`fireEvent(handle, topLevelType, nativeEvent?)`** — delivers a native event to whatever handler
  the renderer registered, the same `instanceHandle` round-trip real Fabric does.
- **`commits`**, **`commands`**, **`responderHandovers`**, **`accessibilityEvents`** — counters and
  logs of what the engine asked the platform to do, for tests asserting "exactly N commits" or
  inspecting an imperative call (`dispatchCommand`, `setIsJSResponder`, `sendAccessibilityEvent`).
- **`reset()`** — clears the recordings and counters (the registered event handler survives), for
  reusing one `installRecordingFabric()` call across several assertions in one test. **`forget()`**
  additionally drops the `find`/`findAll` creation log itself — a file that mounts a fresh tree per
  case and reuses `testID`s needs this, or `find` keeps answering with an earlier case's node.

This host **records what it's handed and derives nothing** — no flattening, no clone protocol, no
view-name rewriting. `propsOf(handle)` reads the author's own bag (`style` is still an object);
`payloadOf(handle)` (below) is what the engine would actually hand Fabric. A question about
committed SHAPE (what Fabric kept, renamed, or flattened) belongs in
`core/engine/cpp/tests/js` — asking it here gets `undefined`, not a plausible guess.

## Reading the live tree

`createLiveTree(fabric)` is a lens **over** the recording host, for residency questions the
creation log can't answer (a popped route, an evicted list cell, a portal toggled off) — it walks
the engine's own live child links, so a removed node stops appearing:

```ts
import { createLiveTree } from '@symbiote-native/test-utils';

const live = createLiveTree(fabric);
const root = live.appRoot(); // the app's own box-none root, RN's synthetic AppContainer unwrapped
expect(live.serialize(root)).toContain('RCTText "Taps: 1"');
expect(live.texts(root)).toContain('Taps: 1');
```

- **`appRoot()`** — the app's `box-none` container, unwrapped so a test doesn't re-check that
  invariant by hand.
- **`nodeOf(handle)`** — a positional read (`viewName`, `props`, `payload`, `children`) for one
  handle; **`walkLive`/`findAllLive`/`findLive`** walk from a root, **anchors flattened** (the
  commit walk's own rule — Svelte leaves an anchor per block, Angular one per composed component).
- **`serialize(root)`** — a subtree as `RCTView(RCTText(RCTRawText "text"))` shorthand.
- **`texts(root)`** — every raw text under `root`, in TREE order (what a reordering list can't get
  from the creation log, which is in creation order).
- **`outline(root)`** — a depth-indented `viewName` list, for asserting an exact shape.

**`payloadOf(handle)`** (top-level export, also `nodeOf(handle).payload`) is what the engine WOULD
hand the renderer — style flattened, the aria fold and RN's processors run — as against `props`,
the author's own bag. Read `padding`, `accessibilityRole`, or a parsed `backgroundSize` off the
payload, not the props, or the read comes back `undefined` with nothing to explain why.

## Measuring the engine, not the app

**`censusLive(...roots)`** counts a live subtree off the engine's own child links —
`{ nodes, anchors, nonAnchors }` — for "how many nodes did the adapter allocate" probes, without
asking any host (works identically against a real device). **`trackHostCrossings(host)`** wraps a
tree host's own methods in place and counts calls into them (`applyOps` excluded) — for "does the
dispatch code cross the host once per event, not once per ancestor" assertions.

## Waiting for async settling

`waitUntil(condition, label, timeoutMs?)` polls once per macrotask until `condition()` holds and
throws (naming `label`) on timeout — the honest replacement for a fixed `setTimeout` tick count,
which is only a proxy for "the framework has settled" and breaks under a loaded test run.
`waitForQuiet(sample, label, options?)` waits until `sample()` returns the same value across
`stableTicks` consecutive macrotasks AND `quietMs` of wall time, then returns the settled value —
the shape for "work has stopped arriving" (a batched commit, a zoneless change-detection pass, a
press-timing timer). `advanceTicks(count)` and `advanceMs(durationMs?)` are kept for the genuine
"let the queue drain" case — a fixed number of macrotasks, or a fixed wall-time window. Do not
raise a tick count to fix a flaky test — that trades a fast failure for a slow one and keeps the
race; reach for `waitUntil`/`waitForQuiet` instead.

## What it does NOT do

- It is not a mocking framework — there's nothing to configure beyond calling
  `installRecordingFabric()`; the fake always behaves like real Fabric's clone-on-write contract.
- It does not stand in for on-device verification — see [Testing](../../README.md#testing) for how
  this headless layer and the on-device `Detox` layer divide the work.

## Related packages

- [`@symbiote-native/engine`](../engine) — the package whose commit path this fake stands in for;
  every adapter's headless test drives the real engine against this fake slot instead of real Fabric.

## Test it

This package has no tests of its own — it _is_ the test double every other package's `vitest` suite
imports.
