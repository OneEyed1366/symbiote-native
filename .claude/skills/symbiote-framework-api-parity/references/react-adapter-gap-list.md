# React adapter gap list (audited 2026-09-25, against react-api-surface.md)

Source: `adapters/react/src/host-config.ts`, `adapters/react/src/render.ts`,
codebase audit (hooks usage, tests, examples). Real-engine tests only count as
`works`; example-only usage with no test is `unverified`.

## Correction (2026-09-25): the original "concurrent features are broken" claim was wrong

An earlier pass (audit + grill-me) concluded `useTransition`/`useDeferredValue`/
`startTransition` were structurally inert, from reading `render.ts` passing `LegacyRoot`
and `host-config.ts` forcing `updateContainerSync`/`flushSyncWork` on every update. That
was inference from reading stubs, never actually run against the engine. Writing the
ground-truth tests (`use-transition-defers.test.tsx`,
`use-transition-native-event.test.tsx`) disproved it:

- `.vendors/react`'s `packages/shared/ReactFeatureFlags.js` sets
  `disableLegacyMode: boolean = true`, and every `react-reconciler` branch on
  `root.tag === LegacyRoot`/`ConcurrentRoot` is written `disableLegacyMode || tag ===
  ConcurrentRoot` (or the inverse) across `ReactFiber.js`, `ReactFiberReconciler.js`,
  and five spots in `ReactFiberWorkLoop.js`. With the flag `true`, the tag is dead:
  every root already behaved as concurrent regardless of what we passed.
- `flushSyncWork()` (`ReactFiberRootScheduler.js:232-240`) only force-commits a root
  when `includesSyncLane(nextLanes)` is true. A transition scheduled via
  `startTransition` lands on a transition lane, not the sync lane, so
  `flushExternalUpdate`'s `flushSyncWork()` call does not touch it.
- Confirmed empirically: `startTransition(() => setState(...))` called from a plain
  `useEffect` AND from a real native `onPress` (via `fabric.fireEvent` through the
  actual `flushExternalUpdate` path) both stay pending immediately after the
  synchronous dispatch, and both correctly commit once the transition lane is later
  allowed to flush.

Lesson for this whole initiative: a host-config stub returning `false` or a no-op does
not by itself prove a feature is broken. React's own scheduler may already route
around it. Verify behavior with a real test before writing a gap into any catalog,
here or for the next framework.

## works (real-engine tested)

Mutation lifecycle (create/update/remove/reorder), `useState`, `useEffect`,
`useLayoutEffect`, `useImperativeHandle`, class error boundaries
(`render-error-reporting.test.tsx`), `Activity` hide/unhide
(`activity-hide.test.tsx`, uses real `setNodeHidden`, not a stub), same-surface
`createPortal` (`create-portal.test.tsx`), cross-surface sharing via
`create-tunnel` (`useSyncExternalStore`-based, `create-tunnel.test.tsx`),
`useTransition`/`startTransition` deferral, including from a real native event
(`use-transition-defers.test.tsx`, `use-transition-native-event.test.tsx`, new
2026-09-25). Suspense's fallback swap for `lazy()`/thrown-promise
(`SuspenseActivityLazyDemo` in `examples/react`, demoed, not yet under a dedicated
test file in `adapters/react/src`).

## the one remaining real gap: Suspense commit-suspension (Suspense-for-Image)

`host-config.ts`: `maySuspendCommit` always returns `false`; `preloadInstance`,
`startSuspendingCommit`, `suspendInstance`, `waitForCommitToBeReady` are no-ops. This
is unrelated to scheduling (proven working above) and unrelated to the root-type tag.
It is specifically the mechanism that lets `<Suspense>` hold a commit while a newly
created host instance is not yet ready (React DOM's canonical case: an `<img>` whose
decode has not finished). Nothing in `core/engine` today reports "not ready yet" for a
host instance, so there is no existing pathway to wire this against, unlike the
scheduling case above.

Impact in practice: mounting an `<Image>` inside `<Suspense>` does not hold the
fallback until the image is decoded; it pops in already-mounted like it would with no
Suspense boundary at all. This is a real, narrow gap, not a whole-adapter regression.

**Second correction, before starting engine work (2026-09-25): stock React Native does
not implement this either.** `.vendors/react`'s own
`packages/react-native-renderer/src/ReactFiberConfigFabric.js:587-644`, the real
reference host config RN ships, has the exact same shape: `maySuspendCommit` returns
`false`, `preloadInstance` returns `true` unconditionally, `startSuspendingCommit`/
`suspendInstance` are no-ops, `waitForCommitToBeReady` returns `null`. Upstream RN's
own Fabric renderer never implements Suspense-for-Image; only React DOM does, because
a browser can synchronously query `<img>.complete`/`.decode()`. So building this in our
adapter is not restoring parity with something RN already had (unlike the
`ConcurrentRoot` case), it is a genuinely new capability beyond both stock RN and this
project's "same experience as web/RN" scope framing, since a web developer moving to
plain RN already does not get this either. Decision to actually build it, made with
that corrected framing, re-raised with the user before writing any `core/engine` code.
Decided: do not build it. Stock React Native itself does not offer this, so it falls
outside this initiative's scope (the framework's own guide, matched to the experience
a web/RN developer already has). Closed as an accepted, out-of-scope limitation.
Documented here for the next person who reads `maySuspendCommit` and assumes it is a
bug: it is not, upstream has the identical stub.

## Stage 1 kept: harmless, correctness-of-intent, does not by itself fix anything

`render.ts`: `LegacyRoot` to `ConcurrentRoot`; `host-config.ts`: added
`supportsMicrotasks: true`, `scheduleMicrotask: queueMicrotask` (`@types/node` added to
`adapters/react`'s `package.json`/`tsconfig.json` for the ambient type, matching the
Angular adapter's precedent). Matches what stock RN's `renderApplication.js` actually
passes (`useConcurrentRoot = Boolean(fabric)`), so it is still worth keeping for
correctness even though `disableLegacyMode` made it inert today. Full monorepo
typecheck and vitest (741 files, 6669 tests) verified green.

## Stage 2 attempted and reverted: do not repeat without a real plan

Tried switching `mount()`/`teardown()` from `updateContainerSync`/`flushSyncWork` to
plain async `updateContainer`, matching stock RN's own `ReactFabric.js:169,183`
literally. This part is real: `.vendors/react` confirms RN's reference `render()`/
`stopSurface()` use plain `updateContainer`, no forced flush, not even on initial
mount. Result: 252 of 296 `adapters/react` tests failed, because nearly every test
calls `mount()` then asserts synchronously with no flush step afterward. Reverted
immediately per the agreed rollback rule, full suite back to 294/296 passing,
verified. This was chasing the same false premise above, that async mount was needed
to unblock `useTransition`. It is not needed for that. If ever revisited, it would
need a monorepo-wide test-helper migration (an explicit flush call after every
`mount()`), which is real work, but disconnected from Suspense-for-Image and not
urgent.

## unverified (userland-only, no dedicated test, likely fine)

`memo`, `lazy`'s mount/unmount mechanics, `useDeferredValue` (return-shape only,
deferral itself now proven working via the same scheduling mechanism as
`useTransition`), `useDebugValue` (no devtools panel wired, low-value to test),
`useId` (used once in `create-tunnel`, untested standalone), `useSyncExternalStore`
outside `create-tunnel` (`use-color-scheme.ts` has no dedicated test),
`useActionState`/`useOptimistic` (built on the same transition mechanism now proven
working, but not directly tested).

## fixed this session

- `examples/react/components/SuspenseActivityLazyDemo.tsx`: stale caveat claiming
  `hideInstance`/`unhideInstance` are no-ops, contradicted by `activity-hide.test.tsx`.
  Corrected to describe the real remaining gap (Suspense commit-suspension).
- `examples/react/components/PortalDemo.tsx`: dangling reference to a nonexistent
  "react-adapter-portal" skill. Removed, pointed at `create-tunnel` instead.
- Added `use-transition-defers.test.tsx` and `use-transition-native-event.test.tsx`,
  real-engine ground-truth tests for transition deferral, both directions.

## Not investigated yet

`ViewTransition`/`Activity`'s Offscreen internals beyond hide/unhide,
`unstable_SuspenseList`, Fragment refs (`createFragmentInstance` family, not in
current host config at all, no vendor React version cited it as stable yet, re-check
against `.vendors/react` version bump).
