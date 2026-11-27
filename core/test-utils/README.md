# @symbiote-native/test-utils

The shared headless test harness of [SymbioteNative](../../README.md). `installRecordingFabric()`
installs a recording tree host and a minimal `nativeFabricUIManager`, and returns a handle to what
a renderer did. The engine, every adapter and the example apps' `vitest` suites share it.

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
between tests. Do not re-install per test. The engine's `getSlot()` (`core/engine/src/fabric.ts`)
reads the slot's methods once and caches them for the life of the process. A second
`installRecordingFabric()` swaps the global, but the engine keeps the slot it already bound.
File-level isolation comes from the test runner, and `reset()` separates tests within a file.

## What `installRecordingFabric()` gives you

- **`find(predicate)`** and **`findAll(predicate)`** search the nodes created since the last
  `reset()`, in CREATION order. This is the creation LOG, not a live tree: a node
  the app removed still answers `find` — see "Reading the live tree" below for a residency
  question ("is this still mounted") the log can't answer.
- **`fireEvent(handle, topLevelType, nativeEvent?)`** — delivers a native event to whatever handler
  the renderer registered, the same `instanceHandle` round-trip real Fabric does.
- **`commits`**, **`commands`**, **`responderHandovers`**, **`accessibilityEvents`** — counters and
  logs of what the engine asked the platform to do, for tests asserting "exactly N commits" or
  inspecting an imperative call (`dispatchCommand`, `setIsJSResponder`, `sendAccessibilityEvent`).
- **`reset()`** clears the creation log, the counters and the call logs. The authored tree and the
  registered event handler survive.
- **`forget()`** does what `reset()` does and also drops the records of all nodes.

This host **records what it's handed and derives nothing** — no flattening, no clone protocol, no
view-name rewriting. `propsOf(handle)` reads the author's own bag (`style` is still an object);
`payloadOf(handle)` (below) is what the engine would actually hand Fabric. A question about
committed SHAPE (what Fabric kept, renamed, or flattened) belongs in
`core/engine/cpp/tests/js`. Under this host `committedPayloadOf()` throws.

## Reading the live tree

`createLiveTree(fabric)` is a lens **over** the recording host. It answers what the creation log
can't: a popped route, an evicted list cell, a portal toggled off. It walks the engine's own live
child links, so a removed node stops appearing:

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
`stableTicks` consecutive macrotasks AND `quietMs` of wall time, then returns the settled value.
Use it for "work has stopped arriving": a batched commit, a zoneless change-detection pass, a
press-timing timer. `advanceTicks(count)` and `advanceMs(durationMs?)` are kept for the genuine
"let the queue drain" case — a fixed number of macrotasks, or a fixed wall-time window. Do not
raise a tick count to fix a flaky test — that trades a fast failure for a slow one and keeps the
race; reach for `waitUntil`/`waitForQuiet` instead.

## What it does NOT do

- It is not a mocking framework. The recorder has nothing to configure: it records what the renderer
  asked for and does not emulate Fabric's clone-on-write.
- It does not stand in for on-device verification — see [Testing](../../README.md#testing) for how
  this headless layer and the on-device `Detox` layer divide the work.

## Related packages

- [`@symbiote-native/engine`](../engine): an adapter's headless test drives the real engine, and
  the recorder takes the place of the native tree host.

## Test it

The package's own suites are `src/*.test.ts` and run with the repository's `vitest`.
