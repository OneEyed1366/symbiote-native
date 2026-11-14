---
name: symbiote-web-platform
description: Design of the web platform for SymbioteNative, a DOM implementation of the engine's tree host in a new package `@symbiote-native/web`. Read BEFORE writing any web code, before widening `Platform.OS` to 'web', before adding a `.web.ts` file to core or an adapter, or before choosing a bundler or a style path for web. Holds the decisions, the seams verified in code, the RN-to-DOM mapping plan, the risks, and what was ruled out (react-native-web as renderer, custom elements, Vite). Status is design only, no web code exists yet.
---

# Web platform design

Status: design only. Nothing here is implemented. Each claim below was read in code, and the file is named so it can be re-checked.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Meaning of web | A DOM implementation of `ITreeHost` under the same engine, for all 5 adapters | Adapters speak only the engine mutation API, so they need no change. Parity stays structural |
| Not taken: RNW as renderer | `react-native-web` is React-only and reported in maintenance mode | A React-only path breaks the full-parity rule for Vue, Svelte, Solid, Angular |
| Not taken: custom elements | No `x-view` style elements as in Lynx | Costs a second element layer on top of the DOM host, buys isolation nobody asked for |
| Bundler | Metro through Expo | Same transformers as native (Vue SFC, Svelte, Angular linker, css-parser). Vite would need all of them rewritten |
| Placement | New package `@symbiote-native/web` (`core/web`) | Keeps the engine the native core. Web code does not ship in native bundles |
| Styling | Classes behave as in RN: the registry resolves a class to a style, applied as inline or atomic CSS | One file gives one result on iOS, Android and web. No browser cascade |
| `Platform.OS` | `'web'`, with `Platform.select({web})` and `.web.ts` files | Third-party code branches on it. The type already lists `'web'` |
| Web driver | Expo CLI (`expo start --web`, `expo export --platform web`) for every example except `bare-rn`. The six examples without `expo` (`angular`, `react`, `solid`, `svelte`, `vue-sfc`, `vue-tsx`) gain `expo` and the web peers | Expo CLI needs the `expo` package and brings the HTML shell, HMR and assets. RNW is a module library only. Vite, webpack and a homegrown Metro shell were offered and not chosen |
| SSR | Not in milestone 1. Client-only, same as an Expo app without Expo Router (`web.output: single`) | `static` and `server` outputs need the Expo Router `app` directory. RNW's server API is React-only |
| Browsers | Same stance as RNW and Expo web: evergreen, `PointerEvent` and `ResizeObserver` with detect, scroll phases from timers | Neither project states a baseline. RNW derives scroll end from a timer, not `scrollend` |
| Packages | Every `packages/*` package, navigation included, gets an optional DOM twin. Optional means a native app never pays for it and a web app without the twin still bundles | Operator decision after run 1 (R7). Supersedes the earlier "navigation and native-module twins are follow-on" |
| First milestone | DOM host plus View, Text, Image, ScrollView, TextInput, Pressable on 5 adapters, one shared parity test | Proves the seam and the parity rule early. Lists, Modal, Animated come later |

## The seam

`core/engine/src/tree-host.ts` defines `ITreeHost`. The native host is the C++ tree, and the headless host is the TS applier in `core/test-utils` (`recorded-tree.ts`, `recording-host.ts`).

A web host is a third implementation. It installs two things, exactly as `installRecordingFabric()` does headlessly.

- `setTreeHost(domHost)` for tree reads and `applyOps`.
- A minimal `globalThis.nativeFabricUIManager` with `registerEventHandler` and no-op stubs, because `fabric.ts` throws without it.

Events re-enter through the slot handler `handler(handle, topLevelType, nativeEvent)`.

The op stream is a public subpath, `@symbiote-native/engine/mutation-buffer`. It has 14 opcodes, six words each, with strings and values interned per batch. The headless decoder is about 60 lines. The DOM version is the same walk with `createElement`, `insertBefore` and `setAttribute`.

`OP_SET_TAG` carries the intrinsic tag (`pressable`, `text-input`, `switch`). On web the tag plus props selects the DOM element and its semantics. This is the web twin of the C++ tag rules.

A surface is an ordinary node, and `OP_COMMIT` names it. The web package supplies `runApplication(name, {rootElement})` and maps the root tag to the DOM container.

## What the web host does not port

High-level behavior is shared JS, so web inherits it.

- Press, pressIn, pressOut and longPress are synthesized from the touch stream in `core/engine/src/events/`. Responder negotiation lives in `events/responder.ts`.
- Built-in event sets live in `core/engine/src/view-config.ts`, not in RN's ViewConfig registry.
- Host behaviors (Pressable, Switch, TextInput handshake) register through `core/components/src/register.ts`.

The 3000 lines of C++ in `SymbioteFabricProps.cpp` shape Fabric payloads and do not run on web. Most of what they translate (`inputMode`, `enterKeyHint`, `autocomplete`, `srcSet`, aria aliases) is already a DOM attribute. The real web work is Text clamping, the ScrollView wrapper with sticky headers, and Pressable accessibility folding.

## Props to DOM pipeline

Step one is `fabricProps(node, propsOf(node))` from `core/engine/src/fabric-props.ts`. It returns one flat bag: style slots hoisted to top-level keys, functions and undefined dropped, aria folded, the behavior's `payloadFold` applied, colors passed through the injected processor. The recording host already uses it this way headlessly. On web the color processor is an identity function.

Step two classifies each key as a style key, a DOM attribute or an RN-only prop, and writes CSS or attributes. The style-key set can be seeded from RN's `ReactNativeStyleAttributes` (pure list, import on web unverified).

The RN-semantic Text rules live only in C++ (`SymbioteFabricProps.cpp`). The TS twin was deleted, and `fabricProps` must not regain it. The web host carries its own copy, asserted by a DOM-level contract test and not by comparison with C++.

- Non-nested Text defaults: `ellipsizeMode: 'tail'`, `allowFontScaling: true`, `overflow: 'hidden'` as a fallback under authored style. Nested Text gets none.
- `numberOfLines` negative or NaN means 0 (unlimited). `disabled` folds into `accessibilityState`. `userSelect` becomes `selectable`.
- A pressable, enabled Text with no role gets role link. On web that means `role=link`, `tabindex=0` and Enter activation.
- `numberOfLines` 1 maps to nowrap + ellipsis, above 1 to line-clamp. `ellipsizeMode` tail maps to `text-overflow: ellipsis`, clip to `clip`. Head and middle have no CSS equivalent and are documented as approximated.
- No web equivalent in milestone 1: `allowFontScaling`, `adjustsFontSizeToFit`, `textAlignVertical`, `includeFontPadding`.

## TextInput

`multiline` picks `textarea`, otherwise `input`. `secureTextEntry` sets `type=password`. `inputMode`, `keyboardType`, `enterKeyHint` and `returnKeyType` map to `inputmode`, `type` and `enterkeyhint`. `autoCapitalize`, `autoComplete`, `autoCorrect`, `spellCheck`, `maxLength`, `readOnly`, `rows` and `placeholder` pass through. RNW's `exports/TextInput/index.js` is the reference table.

`fabricProps` rewrites a TextInput's controlled value into a private `text` key (`value ?? defaultValue`), so the web host reads `text`.

- Submit: Enter emits `topSubmitEditing` only when no composition is active (`isComposing` or `keyCode === 229`). `blurOnSubmit` defaults to true for single-line and false for multiline.
- IME (R4): while a composition is active, a `setTextAndSelection` that would change the DOM value waits for `compositionend`, because writing `value` mid-composition cancels the IME.
- The stale rule from Commands still applies: a command older than the latest emitted `eventCount` is dropped.

## View names

About a dozen host views exist: `RCTView`, `RCTText`, `RCTVirtualText`, `RCTRawText`, `RCTImageView`, `RCTScrollView` with `RCTScrollContentView`, the two TextInput views, `RCTModalHostView`, `RCTInputAccessoryView`, `RCTSafeAreaView`, `AndroidSwitch`, `AndroidProgressBar`.

New files for web: `core/engine/src/platform/index.web.ts` and `core/components/src/component-names/index.web.ts`, next to the ios and android variants.

## Layout

The browser lays out. Yoga defaults differ from CSS defaults, so every View-class element needs a reset. Verified in `ReactCommon/yoga`: `alignContent` is `FlexStart` (`Style.h`) and web defaults are off (`Config.h`).

- Reset: `display: flex`, `flex-direction: column`, `align-content: flex-start`, `align-items: stretch`, `flex-shrink: 0`, `position: relative`, `min-width: 0`, `min-height: 0`, `box-sizing: border-box`.
- `flex` must expand into longhands. RN `flex: n` with n above 0 means grow n, shrink 0, basis 0 (`Node.cpp` `resolveFlexGrow`, `resolveFlexShrink`, `processFlexBasis`). CSS `flex: n` means 1 1 0%.
- RN `flex: -n` means shrink n and grow 0. CSS rejects a negative `flex`.
- RNW's `createReactDOMStyle.js` and its View reset are the reference for the rest, as a table to read and not a dependency.

## Styles

`core/engine/src/node-props.ts` runs `resolveStructuredStyle` on every `style` write. Ten keys become RN's structured forms: `boxShadow`, `filter`, `transform`, `transformOrigin`, `aspectRatio`, `fontVariant` and the four `experimental_background*` keys.

Those forms are arrays of records, the same shape an author may write by hand. The web host therefore needs a records-to-CSS serializer in any case. The engine is not changed.

Colors: web passes an identity function as `colorProcessor` to `bootstrapHost`, so CSS strings survive.

### Style keys with no CSS form

Four keys in `core/web/src/style-table.ts` have the kind `none`, the page writes nothing for them and they are not an error:

- `borderCurve` (iOS corner smoothing)
- `elevation` (Android shadow depth)
- `textAlignVertical` and `includeFontPadding` (Android text box)

`hitSlop` is not a style key and has no DOM form either: the pressable area is the element's own box. Under `DEBUG` the host logs each prop it skipped (`dom-host.skipped.test.ts`).

## Events

The host emits the names in `core/engine/src/events/names.ts`.

- Touch: `topTouchStart/Move/End/Cancel` built from `pointerdown/move/up/cancel`, with `touches`, `changedTouches`, `identifier`, `pageX/Y`, `locationX/Y`, `timestamp`.
- Direct: `topLayout`, `topScroll`, `topContentSizeChange`, `topLoadStart`, `topLoad`, `topLoadEnd`, `topError`, `topSelectionChange`.
- Bubbling: `topFocus`, `topBlur`, `topChange`, `topSubmitEditing`, `topEndEditing`, `topKeyPress`, `topKeyDown`, `topKeyUp`, `topClick`.

Layout payload is `nativeEvent.layout {x, y, width, height}`. ScrollView sticky headers read `y` and `height`. Image load events are emitted only while a listener is wired.

## Activation

Pressable's `handleClick` (`core/components/src/state/pressable.ts`) separates a pointer click from an accessibility activation. A `topClick` whose `nativeEvent` has an own `pointerType` is ignored, because the touch sequence already pressed. A click without it calls `onPress`. A click bubbling from a nested pressable is stopped.

- The host emits `topClick` from the DOM `click` and sets `pointerType` only when `event.detail > 0`. A keyboard or assistive click has `detail === 0`, so the key stays absent.
- A `div` with `role=button` or `role=link` and `tabindex=0` gets no click from Enter or Space. The host synthesizes one on `keydown` Enter, and on Space for buttons.
- Without the `pointerType` guard a mouse click would run `onPress` twice.

## Commands

`dispatchCommand` must serve `scrollTo [x, y, animated]`, `scrollToEnd [animated]`, `focus`, `blur` and `setTextAndSelection [eventCount, text, start, end]`. `flashScrollIndicators`, `zoomToRect`, `hotspotUpdate` and `setPressed` are no-ops on web. `setValue` is the Switch command.

TextInput handshake (`core/components/src/behaviors/text-input.ts`): the host emits `topChange {text, eventCount}` and owns the counter. A `setTextAndSelection` older than the latest emitted count is dropped. A start or end of -1 leaves the caret where it is.

## Gesture arbitration (R1 design)

The engine grants a responder in JS (`events/responder.ts`) and then calls `setIsJSResponder(node, isResponder, blockNative)` through the host. On native that stops a UIScrollView from competing. A browser decides panning earlier and differently.

- Input split: touch input uses DOM touch events registered non-passive, because only a `touchmove` default can be cancelled to stop a pan. Mouse and pen use pointer events. Both feed the same `topTouch*` records.
- `touch-action` is read when the pointer goes down and cannot change mid-gesture. So nodes that carry a start or move should-set listener get `touch-action: none` (or `pan-y` / `pan-x` for a one-axis claim) when the listener appears, decided from the owned-listener ops.
- `setIsJSResponder(node, true, block)` sets a flag that makes the host call `preventDefault()` on later `touchmove` events, and `setPointerCapture` on mouse input. A release or terminate clears it.
- A claim made only on move, after the browser already started panning, arrives as `touchcancel` and cannot be undone. That is the browser's rule, and the approximation must be documented.
- This design needs a real browser to verify. A synthetic DOM cannot pan.

## RefreshControl

Measured with a React page test (2026-10): a ScrollView with a `<refresh-control>` renders the scroller and its content only. The control paints no element, so `onRefresh` never fires on a page and nothing breaks.

Pull-to-refresh on web needs a gesture of its own on the scroller (a pull past the top while `scrollTop` is 0, a spinner, `refreshing` as the stop). It is not built, the browser's own pull-to-refresh is a page reload and is a different thing.

## Image and ScrollView

Image: `routeProp` already resolves `source`, `src` and `srcSet` through `resolveAssetSource` before the host sees them (`resolvesImageSources` in `behaviors/image.ts`). The host receives `{uri, width, height, scale}` shapes and picks the URL. The `srcSet`, `src`, `source` precedence is a C++ rule today (`foldImageProps`), so web carries its own copy of it.

- Default element: `img` with `object-fit` for cover, contain, stretch (fill) and center (none). Gains native `alt`, drag, context menu and `srcset`.
- `repeat` has no `object-fit` equivalent, so that mode falls back to a `div` with `background-image`. This is a recommendation the operator has not confirmed.
- RNW uses a `div` with `background-image` for every mode, a hidden `img` for natural size, an SVG filter for `tintColor` and CSS `blur()` for `blurRadius`. Reference only.

ScrollView: the outer element scrolls (`overflow: auto` per axis) and the content view sits inside it. Both axes map to `RCTScrollView`, as the iOS name table already does. The web `component-names` table can re-export the iOS table, because web is iOS-shaped here (one scroll view for both axes).

Sticky headers (`behaviors/scroll-view/sticky.ts`) pin through a `transform` fed by an AnimatedValue of the scroll offset. On web `isNativeAnimatedAvailable()` is false, so the JS driver runs: `onScroll` at a 16 ms throttle and one commit per frame. It works and is bounded by main-thread commits. CSS `position: sticky` is a later optimization.

## RN modules

`core/engine/src/react-native-host/index.ts` is the single choke point for RN singletons. Under the Expo web alias, `import * as ReactNative from 'react-native'` in `core/components/src/bootstrap/index.ts` resolves to `react-native-web`, so the host members (Dimensions, Linking, Appearance and others) come from RNW with no code of ours.

Expo aliases only the exact ids `react-native` and `react-native/index` (`withMetroMultiPlatform.ts`). Deep `react-native/Libraries/...` imports from the engine stay on real RN files, except `resolveAssetSource`, which goes to `expo-asset`.

The Expo examples run on RN CLI Metro today (`react-native start`, `@react-native/metro-config`, `registerApp` in `index.js`). The web alias and the HTML shell belong to the Expo CLI, so web means a separate `expo start --web` script per example, the web peers `react-dom`, `react-native-web` and `@expo/metro-runtime`, and a web variant of `registerApp` that mounts through `@symbiote-native/web`. Whether `expo start --web` accepts the css-parser transformer is unverified and needs a run by the operator.

`bootstrapHost` already takes injections for color, image source, asset source, view config source, host module and Pressability loader. Web ships a platform variant `bootstrap/index.web.ts` following the folder-as-module rule. RN's `Pressability` pulls UIManager, SoundManager and feature flags, so web passes its own `pressabilityLoader`. Only the React adapter's `use-pressability.ts` calls it.

RNW lacks some members the engine reads: NativeModules, UIManager commands, Settings, ToastAndroid, PermissionsAndroid. Each needs a shim or a documented absence.

## Risks

| Id | Risk | Direction |
|---|---|---|
| R1 | `setIsJSResponder(handle, isResponder, blockNative)` must become `touch-action`, `preventDefault` or pointer capture, or a PanResponder inside a ScrollView fights native scrolling | Spike with a pointer-event fixture |
| R2 | `onLayout` position is parent-relative in RN. `ResizeObserver` gives size only, and a sibling change moves a node without resizing it | Recompute offsets after each commit |
| R3 | Browsers have no momentumScrollBegin/End or scrollBeginDrag/EndDrag | Derive from `scroll`, `scrollend` and pointer state, and document the approximation |
| R4 | A controlled input that re-sets `value` can break IME composition | Guard writes while composing |
| R6 | The Svelte adapter overwrites the DOM globals (`document`, `Node`, `Element`, `Text`, `Comment`, `getComputedStyle`, `CustomEvent`, ...) from mount to unmount (`adapters/svelte/src/dom-shim/patch-globals.ts`). Svelte 5 calls the bare globals at call time, so the patch must last the whole mount. On web it replaces the browser's `document` for the host and for other page code | Decided: the app owns the page, so the web host captures the real `document` and prototypes at install, before any patch, and the shim `document` delegates everything but node creation to the real one. Embedding into a foreign page is not supported. Long-term targets: a bundle-time rewrite of the bare globals in `svelte/internal/client/**` to a shim import, or upstream `sveltejs/svelte` PR #18042 (custom renderers, open since 2026-04, review required, drops `bind:` and transitions on elements). Angular uses a DI-scoped `DOCUMENT` stub, and React, Vue and Solid patch no globals |
| R5 | The 25 binary `Platform.OS` sites in core and adapters assume ios or android | Audited. Switch (`setValue`), Button, TouchableNativeFeedback and InputAccessoryView fall to a safe branch on web. Modal needs its own dismiss semantics (`handleDismiss` returns early unless iOS), and the `stickySectionHeadersEnabled` default (`Platform.OS === 'ios'`) is a product choice. Both wait for lists and Modal |
| R7 | Expo's web resolver throws on three ids imported from `node_modules`: `react-native/Libraries/ReactPrivate/ReactNativePrivateInitializeCore`, `Libraries/Utilities/codegenNativeCommands` and `codegenNativeComponent` (`withMetroMultiPlatform.ts` ~737). Any package that side-effect imports a native component spec dies at bundle time | Seen on `examples/react`: `packages/navigation/src/register.ts` imports `react-native-screens/src/fabric/*NativeComponent`, and `SearchBarNativeComponent.ts` pulls `RendererProxy` then the Fabric renderer. Each package with a `register.ts` needs a `register.web.ts` (folder-as-module, no-op), since no native ViewConfig exists in the DOM. Navigation gets a DOM twin like every other package (see Packages in Decisions) |

## Roadmap

Each slice lands with its own tests and leaves the repo green. Slices 1-5 run headless on a DOM test environment, and slice 7 needs the operator's browser.

| Slice | Content | Verification |
|---|---|---|
| 0 | DOM test env: `happy-dom` (decided), already in the catalog, opted in per file. `core/web` skeleton exists from the withdrawn spike | `pnpm deps:check`, one smoke test |
| 1 | `platform/index.web.ts`, `component-names/index.web.ts` (re-export the iOS table) | Existing platform tests plus a `web` case |
| 2 | `core/web`: `applyOps` over the 14 opcodes, `ITreeHost` reads, Fabric slot stub | The recorded-tree contract tests from `core/test-utils`, run against the DOM host |
| 3 | Props to DOM: `fabricProps` then key classifier, View reset, `flex` longhands, structured style serializer, Text rules copy | DOM-level contract test per rule, mirroring the C++ itest list |
| 4 | Events and commands: pointer/touch/key/scroll/input to engine payloads, `scrollTo`, `focus`, `setTextAndSelection` | Dispatch a DOM event, assert the engine payload and the press callback |
| 5 | `bootstrap/index.web.ts`, `pressabilityLoader`, `runApplication` for the web | Mount a View/Text tree end to end |
| 6 | One shared parity test across React, Vue, Svelte, Solid, Angular | Same descriptor tree renders the same DOM on all 5 |
| 7 | `examples/web-<fw>` canary-only apps (`web-react` exists), web `registerApp` | Operator runs `npm run web` in the example and checks R1-R3 |

Order rationale: the host (2) needs the platform tables (1), and the mapping (3) needs the host. Events (4) need a mounted tree, and the parity test (6) needs every adapter to boot (5). Examples come last because they need a browser run.

Constraints found in `tests/`: `packed-consumer-bundle-matrix.test.ts` only requires each example to keep its own adapter, so adding `@symbiote-native/web` is allowed. `expo-examples-parity.test.ts` compares screen literals, not manifests.

## Modal and Animated (notes, not milestone 1)

Animated: `isNativeAnimatedAvailable()` in `core/engine/src/animated/native/native-animated.ts` is false while no `NativeAnimatedModule` is registered. Web registers none, so every driver takes the JS path (`useNativeDriver` is honoured only when available). Each frame is then a style write through the engine and one DOM commit. A Web Animations API driver is a later optimisation, to price after the first browser run.

Modal: `RCTModalHostView` is an ordinary node in the tree (`core/components/src/view/render-modal.ts`), so the DOM host keeps it in place and events keep their handle. Recommended element is `dialog` opened with `showModal()`: it sits in the top layer, so ancestor `overflow` and `transform` cannot clip it, and it traps focus.

- `cancel` (Escape) maps to `topRequestClose`, `close` to `topDismiss`, and a successful `showModal()` to `topShow`.
- `animationType` maps to a CSS transition on the dialog. `transparent` and `backdropColor` style `::backdrop`, which an inline style cannot reach, so the host owns one generated rule per node.
- A plain `position: fixed` div is the fallback, with the clipping caveat above.

## DOM cost model (design, unmeasured)

The engine hands the host one op buffer per commit, so the host can plan the whole batch before touching the DOM.

- Create: build the element, write its style once through `cssText` or one batched `setProperty` pass, then attach. A bulk append goes through a `DocumentFragment`.
- Update: keep the last written bag per node and write only changed keys. Removed keys reset to empty.
- No layout reads inside `applyOps`. `getBoundingClientRect`, `measure*` and `onLayout` read after the batch, and `ResizeObserver` callbacks are collected and flushed once.
- The fabricProps fold runs per node per commit, as in JS today. If it shows up in a profile, cache by props identity before moving any rule.

Measure with the existing `BenchmarkScreen` on a production web build, one ruler, best-of-N, counters before milliseconds, per `symbiote-perf-measurement`. The comparison column is `react-native-web` on the same screen, not native.

## CLI scaffolding (design)

`packages/cli` models optional features as layers: one row in `src/core-layers.ts` (`CORE_LAYERS`, flag `hasX`), a template under `templates/layers/<name>`, and a `package.json.fragment.json` merged by `merge-layer-fragment.ts`.

- Web fits as a `web` layer with flag `hasWeb`. The fragment adds `expo`, `react-dom`, `react-native-web`, `@expo/metro-runtime`, `@symbiote-native/web` and a `web` script (`expo start --web`).
- The template adds the web entry that calls the web `registerApp` variant. `add` detects the layer from the app's dependencies (`detect-added-layers.ts`).
- Open: `expo` inside a bare RN app may change native builds. Verify on a device build before the layer ships (operator run).

## Operator-run checks

Nothing here was run. Each one needs a browser or a native build, so the operator runs it.

`examples/web-react` is the web canary: `CanaryScreen` alone, no navigator, run by Expo CLI. Other frameworks follow as `web-<fw>`. `scripts/lib/canary-examples.mjs` excludes `web-*` from the native bundle matrix.

The 6 native examples also carry `expo`, the web peers and a `web` script, but navigation blocks them on web (R7), so `web-<fw>` is the real web path for now.

- `expo` added to a bare example: does the iOS or Android build still pass?
- `expo start --web` with `@react-native/metro-config` and the css-parser transformer: does it bundle? Run 1 on `examples/react` stopped on R7. Run 2 on `examples/web-react` bundled 694 modules with the css-parser transformer, so this check passes. Expo only warns that `expo-asset` does not export `build/resolveAssetSource`, and falls back to file resolution.
- `event.detail > 0` on a DOM `click`: does it separate pointer-born clicks from keyboard ones (F37)?
- R1 to R3 in a real browser: gesture inside a scroller, `onLayout` offsets, scroll phases.
- `ReactNativeStyleAttributes` import on web: does it resolve under the Expo alias?

Image element, checked against RNW 0.21.2 (`exports/Image/index.js`): RNW paints a `div` with `background-image` and keeps a hidden `img` for load events and natural size. Our default stays one `img` with `object-fit` (cover, contain, fill, none), because an Image has no children. Only `resizeMode: repeat` needs a background `div`.

## Out of the first milestone

- Lists, Modal, Animated, Reanimated and the Expo-wrapper packages. Of 68 `packages/*`, 52 wrap an Expo module whose upstream has a `.web.ts` file (counted, not audited). Each web twin is a port of that file, per `symbiote-expo-native-module`.
- `onTextLayout`, which needs Range rects.
- A vitest DOM environment. None is installed, so adding `happy-dom` or `jsdom` goes through `symbiote-dependency-catalog` first.

## Upstream references

- `lynx-family/lynx-stack`, `packages/web-platform/web-core` and `web-elements`: the same idea (native-binding API on browser APIs, browser does layout), with a Rust/WASM main thread and a Worker split Symbiote does not need.
- `facebook/react-strict-dom`: Meta's direction, StyleX plus a W3C-aligned subset. Reference for naming only.
- `necolas/react-native-web` 0.21.2: reference tables for RN style to CSS, Text clamp (`-webkit-box` plus `WebkitLineClamp`), View reset.
