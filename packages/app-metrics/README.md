# @symbiote-native/app-metrics

See how your app really performs on users' devices: how long it takes to start and become
interactive, how it handles network requests, when it crashes. One API for every
[SymbioteNative](../../README.md) adapter (React, Vue, Svelte, Solid and Angular).

It wraps [`expo-app-metrics`](https://github.com/expo/expo/tree/main/packages/expo-app-metrics)
(app startup, frame rate, memory, network-request, crash, and session metrics): the core surface on
every adapter, plus an `AppMetricsRoot` on all five and an `AppMetricsErrorBoundary` on React, Vue,
Solid, and Svelte, each wrapping that framework's own catch primitive.

## Scope decision

Unlike every other package in this catalog, `expo-app-metrics` ships real per-framework
surface, not just a thin async-function wrapper. React, Vue, Solid, and Svelte each already have
a subtree-scoped error-catch mechanism (React's class boundary, Vue's `onErrorCaptured`, Solid's
built-in `ErrorBoundary`, Svelte 5's `<svelte:boundary>`), so `AppMetricsErrorBoundary` wraps
that mechanism on all four, sharing the report-building logic through
`core/report-caught-error.ts`. `useNetworkRequestObserver`/`injectNetworkRequestObserver` ship on
all five adapters (see "API" below).

**Angular is NOT a permanent gap - it is version-gated.** Angular's own `@boundary`/`@error`
template primitive (stable `@publicApi` since `@angular/core` 22.2.0) is a real, DI-resolved
subtree error boundary (`ErrorHandler.onViewError`), the same caught-vs-uncaught split this
package already uses elsewhere. This repo pins `@angular/core` to `~22.0.8`
(`pnpm-workspace.yaml`) because `@angular/compiler-cli` >=22.1.0 bundles its own
`@babel/core@8` and its AOT linker asserts Babel 8, while this repo loads that linker INSIDE
Metro's own Babel 7 pipeline - re-tried bumping to 22.2.0 for this package,
reproduced the exact `assertVersion(8)` throw directly against the real installed Babel, no
legacy Babel-7 linker build exists, reverted. `AppMetricsRoot` needed no version bump (it is a
plain `<ng-content>` wrapper marking first render in `ngOnInit`) and ships on `./angular` now.
`AppMetricsErrorBoundary` for Angular - as an `AppMetricsBoundaryErrorHandler` the consumer
provides on their own `@boundary`-owning component, since Angular's own docs mark
`<ng-content>` inside `@boundary`/`@error` an antipattern, so a reusable wrapper COMPONENT is
not the right shape there either - ships once the catalog can move past 22.0.8.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --app-metrics
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --app-metrics
```

Either way: installs `@symbiote-native/app-metrics` and wires the native autolinking
automatically, see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI, wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/app-metrics
```

`expo-app-metrics` and `expo-modules-core` come along as regular dependencies, pinned to exact
versions. Never install either yourself, and never add the `expo` meta-package to your project
(it bundles its own Metro/Babel pipeline, which conflicts with this project's own).

## Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-app-metrics`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism. This needs wiring
into the native host app **once**, covering this package and every other `expo-modules-core`
package with zero further changes. Full mechanics live in the `symbiote-expo-native-module`
project skill.

No app-level permission strings are needed for this package.

</details>

## Shape

```
src/core/     markFirstRender / markInteractive / logEvent / setGlobalAttributes /
              clearStoredEntries / getInactiveSessions / getAllCrashReports (android) /
              reportError / getMainSession / getForegroundSession, the Session and
              NetworkRequestObserver classes (re-exported straight off the native module, same
              pattern as @symbiote-native/audio), installErrorHandler (wraps global ErrorUtils,
              installed automatically on import), plus every public type
src/react/    AppMetricsRoot, AppMetricsErrorBoundary, useNetworkRequestObserver
src/vue/      AppMetricsRoot, AppMetricsErrorBoundary (over onErrorCaptured), useNetworkRequestObserver
src/solid/    AppMetricsRoot, AppMetricsErrorBoundary (over solid-js's own ErrorBoundary), useNetworkRequestObserver
src/svelte/   AppMetricsRoot.svelte, AppMetricsErrorBoundary.svelte (over <svelte:boundary>), useNetworkRequestObserver
src/angular/  AppMetricsRoot (plain <ng-content> wrapper), injectNetworkRequestObserver, no boundary yet (see Scope decision)
```

## API

```ts
markFirstRender(): void
markInteractive(attributes?: IMetricAttributes): void
logEvent(name: string, options?: ILogEventOptions): void
setGlobalAttributes(attributes?: Record<string, ILogAttributeValue> | null): void
clearStoredEntries(): Promise<void>
getInactiveSessions(): Promise<IDebugSession[]> // debug-only
getAllCrashReports(): Promise<ICrashReport[]> // android only, debug-only
reportError(error: IReportErrorInput): void
getMainSession(): Session
getForegroundSession(): Promise<Session | null>
installErrorHandler(): void // called automatically on import

class Session { id; type; startDate; isActive(); getEndDate(); getMetrics(); getLogs(); addMetric(metric) }
class NetworkRequestObserver { constructor(filter?); setFilter(filter) } // + addListener/removeListener
```

`AppMetricsRoot` ships on all five adapters. `AppMetricsErrorBoundary` ships on `./react`,
`./vue`, `./solid`, and `./svelte` only (see Scope decision for `./angular`):

```tsx
<AppMetricsRoot errorBoundaryFallback={...}>{children}</AppMetricsRoot>
<AppMetricsErrorBoundary fallback={...}>{children}</AppMetricsErrorBoundary>
```

Angular's `AppMetricsRoot` takes no `errorBoundaryFallback` (no boundary to gate yet) - just
`<app-metrics-root><ng-content /></app-metrics-root>` in a template.

`AppMetricsRoot.wrap(App)` is React-only (a static helper on the class).

`useNetworkRequestObserver` ships on React, Vue, Solid, and Svelte, taking a getter of
`{ filter?, onStarted?, onCompleted? }` (a plain object on React) and returning the
`NetworkRequestObserver`; Angular's twin is `injectNetworkRequestObserver`, same shape.

```ts
import { markFirstRender, reportError } from '@symbiote-native/app-metrics';
import { AppMetricsRoot, AppMetricsErrorBoundary } from '@symbiote-native/app-metrics/react';
// or '/vue', '/solid', '/svelte'; '/angular' exports AppMetricsRoot + injectNetworkRequestObserver only
```

## Notes

- **`getForegroundSession` is typed `@platform ios` in upstream's own JSDoc, but its native
  module implements it on both platforms**, confirmed by reading `AppMetricsModule.swift` and
  `AppMetricsModule.kt` directly, not the comment. Ported as unconditionally available here.
- **`getAllCrashReports` is Android-only** on the native module; calling it off Android throws
  `UnavailabilityError`, matching this repo's own convention for every other platform-gated
  function. Upstream itself has no such guard, since it never wraps the raw native module in
  per-platform checks; this package normalizes it the same way every sibling package does.
- **`installErrorHandler` runs automatically the moment this package is imported**, an eager
  side effect in `src/core/index.ts` matching upstream's own `index.ts`, wrapping React
  Native's global `ErrorUtils` handler so an unhandled JS error reaches `reportError` before
  chaining to whatever handler ran before it.
- **`AppMetricsErrorBoundary` reports through `core/report-caught-error.ts`, independent of this
  engine's `reportUncaughtError` channel** (`core/engine/src/report-error.ts`). A caught error
  never reaches this engine's own uncaught-error reporting, by design, on any of the four
  adapters that have one - see each adapter's own `render-error-reporting.test.*`.
- **Vue's `onErrorCaptured` gives no component stack** (its `info` argument is a lifecycle-phase
  string, not a real trace), so the Vue and Solid boundaries call `reportCaughtError(error)` with
  no second argument; only React's class boundary has a real `componentStack` to forward.
- **Solid's `mount()` and Svelte's `mount()` both rethrow an uncaught error** rather than
  swallowing it (each adapter's own tested contract) - `AppMetricsRoot` without
  `errorBoundaryFallback` on those two adapters leaves that throw to reach the caller, same as
  not wrapping the tree at all.
- `Session` and `NetworkRequestObserver` are native `SharedObject` classes exposed as class
  properties on the native module (see the `symbiote-expo-native-module` skill's SharedObject
  section) - there is no JS logic to port beyond the re-export, same as
  `@symbiote-native/audio`'s `AudioPlaylist`.
- The canary `AppMetricsScreen` in the `examples/expo-*` apps exercises the root, the boundary and
  the network observer.

## Common questions

- **What does it collect?** Startup (cold/warm launch, bundle load, time to first render), frame
  rate, memory, sessions, and your own events.
- **Where do the numbers go?** EAS Observe, or any OpenTelemetry-compatible backend.
- **Time to interactive missing.** You must mark the app interactive yourself.

Sources: [Expo docs: Introduction to EAS Observe](https://docs.expo.dev/eas/observe/introduction/),
[Introducing Observe](https://expo.dev/blog/introducing-observe).

## Test it

Core is tested the same way as every other package in this catalog: a fake native-module object
in place of `requireNativeModule` (`src/core/app-metrics.test.ts`, `src/core/
install-error-handler.test.ts`). The React layer is a real mount through this repo's own
Fabric-recording harness (`mount`/`unmount` + `installRecordingFabric`, ADR 0025):
`src/react/app-metrics-root.test.tsx`, `src/react/app-metrics-error-boundary.test.tsx`, and
`src/react/use-network-request-observer.test.tsx`, adapted from upstream's own
`@testing-library/react-native` test suites onto this project's harness.
