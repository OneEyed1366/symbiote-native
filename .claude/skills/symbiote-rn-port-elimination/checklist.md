# RN-port elimination: ralph checklist

Source of truth between iterations. Never trust memory: tick here the moment a step is done.
Started 2026-10-09 (ralph iteration 1). The 2026-09-10 audit is stale in places: process-transform,
box-shadow, background-image, filter and transform-origin already import RN. Verdicts below are
HYPOTHESES from that audit until the row is walked against the current code.

## Per-module procedure (every row)

1. [sym] list every exported symbol (codegraph node/explore) and write them in the row notes
2. [rn] locate the RN counterpart in the vendored react-native checkout (VALUE-import closure, not `import type`)
3. [dep] closure reaches RendererProxy / ReactFabric-* / react? Then it cannot be imported (Tier C)
4. [red] TDD: pin the behavior with a test that FAILS on the divergence (or characterize if equal)
5. [swap] replace the port with an import or a thin wrapper, keep an explanatory header
6. [todo] not importable: comment `TODO(rn-port): <why>` on the symbol
7. [run] vitest for the touched dirs plus typecheck, then tick the row

Legend: `[ ]` todo / `[x]` done / `[~]` walked and kept (reason) / `[!]` needs a user decision (grill-me)

## Global decisions (resolve first)

- [x] D1 work branch: user ruled to STAY on `tech-debt/rn-parity` (2026-10-09)
- [x] D2 not a blocker: every adapter bootstrap already imports `react-native` (which needs `react`); our animated/style.ts has no isValidElement
- [x] D3 user ruled: ANY behavior change is allowed if it is what RN does (interaction-manager stub and Pressability included)

## Group 1: style processors (core/engine/src)

- [x] process-transform (44): already imports RN
- [x] process-transform-origin (40): already imports RN
- [x] process-box-shadow (45): already imports RN
- [x] process-background-image (84) + process-background-longhands (68): already import RN
- [x] process-filter (62): already imports RN
- [x] process-aspect-ratio (41): now wraps RN `processAspectRatio` in try/catch (it1). RED test: release build `'1/2/3'` -> 1 as RN. D3 accepted that change
- [x] process-font-variant (16): imports RN `processFontVariant`; ported RN tests stayed green, tsc clean (it1)
- [x] style-sheet/ (160): hairlineWidth and roundToNearestPixel now go through the `PixelRatio` facade (the scale lookup copy is gone); the rest is RN-shaped glue (it1)
- [x] style/ (32): flattenStyle kept with `TODO(rn-port)`: upstream returns undefined / the same object, 17 callers need a fresh record (it1)
- [x] styles.ts (357): KEEP + TODO (RN's `StyleSheetTypes.d.ts` needs React types, no `I` prefix, no animated leaves); structured-style.ts (180) already calls RN's `process*`; style-preprocessors.ts (40): KEEP + TODO (RN's registry is read only by its view configs)
- [x] style-registry/ (469): KEEP (no RN analogue)
- [x] platform-color/ (118): KEEP
- [x] fabric-props.ts COLOR_PROPS vs `ReactNativeStyleAttributes`: no key missing, pinned by `fabric-props-color-keys.test.ts` (every RN colour key converts). Headless builder only, the device one is C++
- [x] commit.ts `jsonEqual`/`propsEqual` no longer exist (setProp uses `Object.is`); `addStyle` stays: RN's `addNestedProperty` diffs attribute configs, a different job

## Group 2: device and app modules

- [x] platform/ (318): KEEP with TODO(rn-port): `OS` is chosen by file at bundle time and read at module scope (~7 sites in core/components), a host facade answers only after wiring
- [x] dimensions/ (235 -> types only): facade `Dimensions` in react-native-host over RN's own (it1)
- [x] pixel-ratio/ (41 -> types only): facade `PixelRatio` (it1)
- [x] appearance/ (114 -> types only): facade `Appearance`; adapters now return `ColorSchemeName | null | undefined` as RN (it1)
- [x] app-state/ (154 -> types only): facade `AppState` (it1)
- [x] i18n-manager/ (121 -> types only): facade `I18nManager`; vitest stub `NativeI18nManager` (it1)
- [x] settings/ (188 -> gone): facade `Settings`; vitest host takes Settings.ios, Android contract tested on RN SettingsFallback (it1)
- [x] back-handler/ (148 -> types only): facade `BackHandler`; vitest host takes the Android file; `bootstrapHost` reads `ReactNative.BackHandler` so RN subscribes at startup (`installBackHandler` is gone) (it1)
- [x] layout-animation/ (259): facade; dir keeps types + `coerceLayoutAnimationType` (RN's Keyboard does it inline). RN quirk: `setEnabled` is a no-op (pinned as characterization)
- [x] native-modules/ (184): KEEP with TODO(rn-port): RN's `TurboModuleRegistry` captures `__turboModuleProxy` at import, so a late fake or a headless engine never sees it. Comments cut to budget
- [x] interaction-manager/ (121): facade; the dir keeps types + `Events` (TODO(rn-port): standalone constant)
- [x] app-registry/ (424): KEEP, checked: it already hands runnables and headless tasks to RN's own AppRegistry through `IHostRegistrar`; the local registry is the mount seam, and RN's module loads the renderer (RendererProxy)
- [x] report-error.ts (72): KEEP, checked: it calls RN's `global.ErrorUtils.reportError`, a bridge and not a port
- [x] dev-settings/ (80 -> type only): facade `DevSettings`, typed with our `IDevSettings` (RN's d.ts misses `onFastRefresh`)
- [x] systrace/ (96 -> gone): facade `Systrace`; the 9 old tests passed against RN's own unchanged
- [x] react-native-version/ (29): imports RN's `Libraries/Core/ReactNativeVersion` (baked JS version, not `PlatformConstants`; RED test pinned it to the installed package)
- [x] event-emitter/ (20): already imports RN's EventEmitter
- [x] utf-sequence.ts (19): imports RN's `UTFSequence`; RED test: RN throws on a write in dev
- [x] sound-manager/ (49): KEEP with TODO(rn-port): not on RN's `react-native` index, a static deep import would load `TurboModuleRegistry` into every adapter's barrel

## Group 3: imperative UI modules

- [x] permissions-android/ (265): facade; `PERMISSIONS`/`RESULTS` stay our copy (TODO(rn-port), pinned to RN's by a test); Android request path + rationale dialog untested headless (Platform pinned to iOS)
- [x] alert/ (433): facade, types-only dir
- [x] linking/ (214): facade, types-only dir
- [x] action-sheet-ios/ (184): facade, types-only dir
- [x] share/ (235): facade, types-only dir; Android `ShareModule` path untested headless
- [x] vibration/ (201): facade
- [x] toast-android/ (205): facade (Android variant); iOS fallback test imports RN's `ToastAndroid.ios`
- [x] image-loader.ts (284): KEEP with TODO(rn-port): RN's statics sit on the `Image` component module, which loads React's renderer. Comments cut to budget
- [x] status-bar/ (461): KEEP (statics hang on React.Component)
- [x] keyboard/ (165): KEEP with TODO(rn-port): RN's `Keyboard.dismiss` goes through `dismissKeyboard` and the renderer. Its test now drives RN's real `LayoutAnimation`
- [x] accessibility-info/ (712): KEEP with TODO(rn-port) in index.ios.ts and index.android.ts: RN's module imports `RendererProxy` (React's renderer)
- [x] core/components bootstrap: now imports `react-native/Libraries/Image/resolveAssetSource` directly, so the `Image` component (renderer) is never touched; RED test: the mock has no `Image` member. Stale header ("Flow cannot be parsed") fixed

## Group 4: events and touches

- [x] touch-history.ts (196): KEEP with TODO(rn-port): RN's `ResponderTouchHistoryStore` throws on a touch without an identifier, and a throw inside responder negotiation drops real touches. Split `recordTouchTrack` under the complexity limit, interfaces to types
- [x] pan-responder/ (548): KEEP with TODO(rn-port): RN reads `event.touchHistory` and breaks without it, ours reads `nativeEvent.touchHistory` with a `touches` fallback. A move needs `touchHistory` on the event object in `events/index.ts` (own task)
- [x] accessibility-props.ts (161): KEEP with TODO(rn-port): RN's fold is inline in the `View.js` component body, not importable
- [x] view-config.ts (143): KEEP with TODO(rn-port): RN's `BaseViewConfig` keys events by `topXxx` and registration names, ours is a flat prop-name set. New `view-config-parity.test.ts` pins the 20 RN base events a plain view lacks (text input, touch routed in `node-events`, pointer, gesture-handler); pointer events are a characterization with a QUESTION
- [x] events/ (924): KEEP, checked in outline: it is the engine's own press and responder synthesis (see D4), not a port of one RN module
- [x] core/components state/pressable.ts + behaviors/pressable.ts: DEFERRED by the user's ruling (D4)
  - the engine synthesizes `press`/`pressIn`/`pressOut` from the touch stream
  - RN's `Pressability` needs raw responder handlers per node, so a swap is a new press design (engine events plus C++ tag rules)
  - TODO(rn-port) sits at the top of state/pressable.ts, and React's `usePressability` already runs RN's class
- [x] core/components behaviors/touchable-without-feedback.ts, scroll-view/responder.ts: KEEP, checked. Both are the body of a React class component in RN (`TouchableWithoutFeedback.js`, `ScrollView.js:1263-1546`), not importable; their headers already say which RN lines they follow

## Group 5: animated (core/engine/src/animated, 5654 LOC, package deal)

- [x] animations/spring-config.ts: a typed re-export of RN's `SpringConfig`, a grid sweep matched exactly before the copy went
- [x] easing.ts: already imports RN's Easing, checked
- [x] the rest of animated/ is DEFERRED by the user's ruling (D5), TODO(rn-port) at the top of animated/index.ts
  - files: operators, graph, value, value-xy, color, interpolation, native/native-animated, props, event, style, mock, shared, native/validation, animations/{base,timing,spring,decay,composition,tracking}
  - RN's `Animation.js` imports `AnimatedProps`, which imports `RendererProxy` (React's renderer)
  - a swap would put React into every other adapter, and the native driver runs through the engine's own packet layer

## Group 6: core/components (state/view/behaviors with RN-port headers)

- [x] state/cell-render-mask.ts (124) vs `CellRenderMask`: typed wrapper over `@react-native/virtualized-lists` (catalog dep), 300-sequence fuzz matched before the copy went
- [x] state/virtualize-utils.ts vs `VirtualizeUtils`: now a wrapper over RN's, 4000-round sweep matched, flag test drives RN's `fixVirtualizeListCollapseWindowSize` override
- [x] state/list-viewability.ts (171) vs `ViewabilityHelper`: KEEP + TODO (RN's is a stateful class with per-config timers, ours is pure and runs one pass over all pairs)
- [x] state/virtualized-list-diagnostics.ts (83) vs `FillRateHelper`: not a port, our own device diagnostics tap, KEEP
- [x] state/modal-warnings.ts, state/switch.ts, state/text-input.ts: KEEP + TODO (logic lives inside React class/function bodies, nothing exported)
- [x] view/render-keyboard-avoiding-view.ts, render-scroll-sticky.ts, render-modal.ts, render-button.ts: KEEP + TODO, same reason
- [x] behaviors/{activity-indicator,image-background,refresh-control,switch}: KEEP + TODO; layout-conformance declares a tag only, no port

## Group 7: files outside the audit (found by grepping "port of RN" / "mirrors RN" in adapters and packages)

- [x] adapters/react hooks/use-window-dimensions.ts: verbatim port of RN's hook. Swapped to RN's and reverted: its `NativeDeviceInfo` import needs a bridge and the React barrel loads it in every Hermes itest (118 crashes). KEEP + TODO(rn-port)
- [x] adapters/react hooks/use-color-scheme.ts: was a copy of RN's hook. Now RN's own (deep import, typed wrapper), RN's `Appearance` initializes lazily so Hermes itests stay green. Identity test `use-color-scheme.test.tsx`. The other adapters' versions are lifecycle code of their framework, not copies
- [x] components/state/list-keys.ts `defaultKeyExtractor`: was a copy of `keyExtractor` in RN's `VirtualizeUtils`. Now delegates to it through `virtualize-utils.ts`, wrapped in `String` so key maps stay uniform. Differential test `list-keys.test.ts`
- [x] state/{list-metrics,flat-list,section-list}.ts, pan-responder/gesture-math.ts, events/delivery.ts, headless-tasks.ts: read. Own state-machine code, RN's versions live inside class bodies
- [x] it5 name sweep: our exported names intersected with RN's. Left are Animated nodes (deferred D5), `normalizeColor` (already wraps `@react-native/normalize-colors`), `process*` (Group 1), `normalizeRect` (RN's does not zero-fill, not a mirror)
- [x] tree-host.ts, imperative.ts: false hits of the grep, no RN port
- [x] engine/src/invariant.ts: was a copy of the `invariant` package (RN's own dependency, already in the catalog). Now `export { default as invariant } from 'invariant'`, dependency `invariant` + `@types/invariant` in core/engine via catalog. A `const` alias breaks TS2775 on assertion signatures, the re-export form does not
- [x] engine/src/text-input-state.ts: KEEP, RN's `TextInputState` focuses through codegen commands on a host ref, ours drives `dispatchViewCommand` on an engine node
- [x] engine/src/asset-source-resolver.ts + image-source-resolver.ts: injection seams for headless runs, bootstrap wires RN's `resolveAssetSource` into both (the seam is the point)
- [x] engine/src/scroll-responder.ts: a slot filled by core/components (cycle break), not a port
- [x] engine/src/native-events.ts: facade swap (user ruling). `DeviceEventEmitter` is RN's `RCTDeviceEventEmitter`, `NativeEventEmitter` builds RN's class when given a module and uses the device bus otherwise. The `runWrapped` sync lane stays as a wrapper over `addListener`. Removed: the fallback hub, `installDeviceEventHub`, `setDeviceEventSource`, the `deviceEventSource` bootstrap option
- [x] packages/* `core/` ports mirror Expo modules, not RN: out of scope for this list
- [x] svelte/solid `*-props.ts` mirror RN's prop types per adapter by design (`<prop_types_split_agnostic_vs_per_adapter>`)

## Recipe for a Tier B facade swap (proved on Dimensions + PixelRatio, it1)

1. RED: add the name to the `forwards %s` list in `react-native-host.test.ts`
2. `export const X = hostObject<IReactNative['X']>('X')` in `react-native-host/index.ts`
3. engine `index.ts`: export X from `./react-native-host`; the old dir keeps TYPES only (adapters re-export them)
4. vitest: stub RN's native spec in `vitest.config.ts` (`RN_STUBBED_SPECS`, like `NativeDeviceInfo`) and add the real upstream module to `setReactNativeHost({...})` in `vitest.setup.ts`
5. tests that drove the port through our device hub emit through RN's `RCTDeviceEventEmitter` (`emitWindowDimensions` in core/test-utils); spies on the facade work (`set`/`defineProperty` traps)
6. Hermes itests have no `react-native`: a file that mounts a view reading X calls a stub host helper (`simulator-window.ts`)
7. the app entry must wire the host BEFORE app modules run: `core/components/src/bootstrap` now calls `setReactNativeHost` at import (module-scope `Dimensions.get` in app files)
8. delete the port's tests that only re-test RN; keep wiring tests (Positive/Negative)

Changeset `.changeset/rn-port-elimination-device-modules.md` exists; append a sentence there per module swap. Nothing is committed.

## Committing a swap series

- The `commit-msg` hook wants a `.changeset/*.md` in every commit that touches a published package, so each commit carries a small one.
- The pre-commit `tsc` sees the staged files over the WORKING tree, so stage the final version of a file. A commit can pass the hook and still not build alone.
- `commit-size` stops at 400 lines and one file can exceed it. Raising `commit` in `code-health.json` needs the user's yes and is restored after.
- Back up first with `git diff HEAD --binary > .git/x.patch`, since a failed lint-staged run can rewrite the tree.

## Log

- 2026-10-09 it1 Group 3 wave done (Alert, Linking, Vibration, Share, ToastAndroid, ActionSheetIOS, PermissionsAndroid). `tsc --build` clean, vitest green bar load-flaky files, Hermes itests 810 PASS.
- Behavior now RN's: a missing native module throws (Toast was a no-op), Android Toast `TOP`/`BOTTOM` are 49/81. Nothing is committed.
- Hook trap: it scans every comment of a touched file, so one old over-long comment blocks any edit of that file until all are fixed at once (`Write` the whole file). vitest.config.ts, recording-host.ts, keyboard.test.ts are cleaned. Still dirty: engine `index.ts` is fine now; angular `keyboard-avoiding-view.test.ts` has 8 long comments.
- Group 3 + interaction-manager + layout-animation done: vitest 11573 pass, `tsc --build` clean, Hermes itests 818 PASS.
- Next: platform/, native-modules/, keyboard/ (Tier C part), accessibility-info/, image-loader.

- 2026-10-09 it1 state at the end: vitest 11667 pass, `tsc --build` clean. Full Hermes itest run (`node scripts/run-itests.mjs`, prebuilt tester) after the swap: 811 PASS, 7 timing FAILs in adapter-create-cost / child-list-scaling / teardown-sweep-cost, all green when rerun alone (parallel-load noise, not the host). `harness.ts` imports `rn-host-stub.ts`. Nothing is committed. Next: appearance (needs stub methods with return values in `STUBBED_SPEC_CONSTANTS`), app-state, settings, back-handler, layout-animation, linking, alert, share, vibration, toast-android, permissions-android, action-sheet-ios.
- 2026-10-09 it2: every checklist box is ticked. Group 6: `CellRenderMask` and `VirtualizeUtils` are RN's (dependency `@react-native/virtualized-lists` through the pnpm catalog), the rest is KEEP + TODO(rn-port). vitest 11573 pass, `tsc --build` clean, Hermes itests 172 files, no FAIL or CRASH.
- it2 traps: (1) RN's flags module reads a bridge spec at import, so `scripts/run-itests.mjs` stubs `NativeReactNativeFeatureFlags` as null; builds now overlap through `createLimiter`. (2) `rn-host-stub` must not import the engine barrel, else stock itests evaluate RN's `Platform.ios` before their bridge fakes. (3) A pnpm-workspace.yaml edit is only allowed once all its long comments are fixed, they were cut to hook budget.
- 2026-10-09 it4: device event hub swapped for RN's bus. vitest 11597 pass, `tsc --build` clean, Hermes itests 172 files with no FAIL or CRASH. Tests that played "native" through `RN$registerCallableModule` now call `emitRnDeviceEvent` (test-utils).
- it4 traps: (1) a Hermes itest has no `react-native`, so `animated-fixture.ts` hands the host a fake `DeviceEventEmitter` and `NativeEventEmitter` on top of `stubHost`. (2) `setDeviceEventSource` was exported by five adapter barrels, removing it touched them all. (3) Editing a test file makes it owe every old long comment, `Write` the whole file.
- 2026-10-09 it1: checklist created. Step 0 (Flow in vitest) is already satisfied: vitest.config.ts strips types and the process-* modules import RN.
