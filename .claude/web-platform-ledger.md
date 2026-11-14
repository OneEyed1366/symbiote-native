# Web platform ledger (ralph-loop, started 2026-10-20, max 15 iterations)

Task: rework the idea of adding a web platform to SymbioteNative.
Method: /vendor + /web-search of RN-ecosystem options, /grill-me for decisions, rules D1-D11.
No done-criterion given, so ask via grill-me (D10). No promise.

## Facts (verified in code, D9)

- F1 `core/engine/src/tree-host.ts` -> `ITreeHost` is the seam.
  - `applyOps(batch)` consumes the opcode buffer from `mutation-buffer.ts`.
  - Opcodes: CREATE_ELEMENT/RAW_TEXT/ANCHOR/VOID, APPEND/INSERT/REMOVE, SET_PROP/TEXT/COMPONENT/TAG, OWNED_LISTENER, UNDERLAY_SHOWN, COMMIT.
  - Reads: propOf, childrenOf, parentOf, ancestorsOf, measure*, getBoundingClientRect, dispatchCommand.
  - Native host is the C++ SymbioteTree. Headless host is the TS applier in `core/test-utils`.
  - `setTreeHost()` installs one. A DOM host is a third implementation of an existing interface. Adapters stay untouched.
- F2 Platform rules (RN prop to Fabric payload) live in C++: `SymbioteFabricProps.cpp` (3027 lines), `SymbioteTree.cpp` (2172).
  - They shape Fabric payloads. On web the target is DOM attributes and CSS.
  - So it is a different mapping (RNW `createDOMProps` analogue), not a port.
- F3 The engine deep-imports pure-JS RN helpers.
  - `react-native/Libraries/StyleSheet/process{Filter,Transform,BoxShadow,Background*}`, `Animated/Easing`, `vendor/emitter/EventEmitter`, `Interaction/TouchHistoryMath`, `Core/ReactNativeVersion`.
  - `core/components/src/bootstrap` imports `ReactNativeViewConfigRegistry`, `Pressability`, `resolveAssetSource`.
  - Aliasing `react-native` to `react-native-web` would break the engine.
  - A web build must keep real `react-native` resolvable (Flow source, Metro strips it), or lift those helpers.
- F4 `react-native` is a peerDependency (>=0.86) of the engine. CLAUDE.md pins it as an explicit top-level app dependency. Web needs a decision here.
- F5 Native layout is stock Yoga (invariant). On web the browser CSS engine lays out, as Lynx does. Yoga-vs-CSS divergences are still to enumerate.

- F6 The host view set is small, about a dozen names.
  - Core: RCTView, RCTText, RCTVirtualText, RCTRawText, RCTImageView, RCTScrollView (+ RCTScrollContentView).
  - Input: RCTSinglelineTextInputView, RCTMultilineTextInputView, RCTInputAccessoryView.
  - Other: RCTModalHostView, RCTSafeAreaView, AndroidSwitch, AndroidProgressBar.
  - A viewName to DOM map is short, plus third-party ViewConfigs.
- F3b Expo CLI (`withMetroMultiPlatform.ts:193`) aliases only the exact ids `react-native` and `react-native/index` to RNW on web.
  - Deep `react-native/Libraries/...` imports are not aliased, except `resolveAssetSource` -> `expo-asset`.
  - So F3 is softer than first read: the engine's helper imports may resolve to real RN files.
  - Hypothesis H1, unverified: `bootstrap` (Pressability, ViewConfigRegistry) pulls native-only RN modules and breaks on web.
  - H1 needs a resolution probe, not an app build.
- F7 `core/css-parser` compiles CSS to RN style objects at build time (Metro transformer). `engine/style-registry` resolves classes at runtime.
  - On web the browser could consume the CSS as is. That changes cascade semantics versus RN flattening.
  - Decision for the operator.
- F8 RNW pieces worth lifting as reference (MIT, React-agnostic):
  - `StyleSheet/compiler/createReactDOMStyle.js` (214 lines), `normalizeValueWithProperty`, `unitlessNumbers`, `createDOMProps` (919).
  - View reset styles: display flex, column, shrink 0, position relative, min 0, box-sizing border-box.
  - RNW `ResponderSystem` (688) turns DOM pointer events into RN responder events. Symbiote needs the same normalization into its own JS responder path.
- F9 Lynx web applies element PAPI calls (`__CreateElement`, `__SetAttribute`) to the DOM from a Rust/WASM main-thread runtime.
  - Custom elements `x-view`, `x-text`, `x-image`, `x-input`, `x-list` replace native views.
  - Its PAPI has the same shape as our opcode buffer.
  - It runs app JS in a Worker. Symbiote has no need for that.

- F10 `core/engine/src/react-native-host/index.ts` is the single choke point for RN singletons.
  - `setReactNativeHost(reactNative)` hands over the module at bootstrap. Each member is a Proxy that reads it per call.
  - Members: UIManager, NativeModules, Dimensions, PixelRatio, I18nManager, Appearance, AppState, BackHandler.
  - More members: Linking, Alert, Share, Vibration, DeviceEventEmitter, NativeEventEmitter, InteractionManager, LayoutAnimation.
  - Also the Pressability loader and the codegen / requireNativeComponent functions.
  - On web a host object of about 25 members replaces RN there.
  - RNW already ships many of these non-view modules. It can serve as a module library (optional peer), not as the renderer.
  - Open: which members RNW lacks (NativeModules, UIManager commands, Settings, ToastAndroid, PermissionsAndroid).
- F11 Yoga vs CSS defaults, verified in vendored RN.
  - Yoga: `alignContent: FlexStart` (`Style.h:906`), `useWebDefaults_ = false` (`Config.h:75`).
  - So flexShrink 0 and column are Yoga's, and the web-defaults flag is their mirror image.
  - RNW's View reset encodes the same list: alignContent flex-start, alignItems stretch, flexShrink 0, column, relative, min 0, border-box.
  - The DOM host must apply that reset to every RCTView-class element, or layout silently differs.

- F12 H1 result: `core/components/src/bootstrap/index.ts` already takes injection points.
  - `bootstrapHost({colorProcessor, imageSourceResolver, assetSourceResolver, nativeViewConfigSource, reactNative, pressabilityLoader})`.
  - But the module imports `react-native`, `.../resolveAssetSource` and `.../ReactNativeViewConfigRegistry` statically, and calls `setReactNativeHost(ReactNative)` at import time.
  - Under an Expo web alias that import yields RNW, so the host members come from RNW without code. `resolveAssetSource` is remapped to `expo-asset`.
  - `ReactNativeViewConfigRegistry` is pure (imports only `invariant`). RN `Pressability` is not: it imports UIManager, SoundManager, feature flags, Platform.
  - Only `adapters/react/src/hooks/use-pressability.ts` calls `loadPressability`. A web bootstrap needs its own `pressabilityLoader`.
  - Shape: a platform variant `bootstrap/index.web.ts` per the folder-as-module rule, not a fork of the native file.
- F13 Two seams must be installed by a web host, exactly as `installRecordingFabric()` does headlessly (`core/test-utils/src/recording-host.ts:117`).
  - `setTreeHost(domHost)` for the tree.
  - A minimal `globalThis.nativeFabricUIManager` slot: `registerEventHandler` plus no-op stubs. `fabric.ts` throws without it.
  - Events re-enter through the slot handler: `handler(handle, topLevelType, nativeEvent)`.
  - So the proven headless recipe is also the web recipe.
- F14 Yoga `flex` differs from CSS `flex`, verified in `Node.cpp:329-458`.
  - RN `flex: n>0` means grow n, shrink 0, basis 0. CSS `flex: n` means 1 1 0%.
  - RN `flex: -n` means shrink n, grow 0. CSS rejects negative `flex`.
  - The host must expand `flex` into longhands. RNW only special-cases `flex: -1`.

- F15 `core/engine/src/node-props.ts:119` runs `resolveStructuredStyle` on every `style` write (`structured-style.ts`).
  - Ten keys are parsed to RN's structured forms: boxShadow, filter, transform, transformOrigin, aspectRatio, fontVariant, experimental_background{Image,Size,Position,Repeat}.
  - String inputs become arrays of records. Array inputs already are that form, so the web host needs a records-to-CSS serializer regardless.
  - Decision: serialize on web, no engine change. An engine flag that skips the parse is the rejected alternative (touches the commit hot path).
  - Colors: `bootstrapHost({colorProcessor})` takes an identity function on web, so CSS strings survive.
- F16 High-level behavior is already shared JS, so the web host inherits it.
  - Built-in event sets live in `core/engine/src/view-config.ts`, not in RN's ViewConfig registry.
  - Press, pressIn, pressOut, longPress are synthesized from the touch stream in JS (`events.ts`). Host behaviors (Pressable, Switch, TextInput handshake) register through `core/components/src/register.ts`.
  - So the web host feeds raw touch/focus/scroll/change top-level events and implements the node ops. Nothing above that is ported.
- F17 The C++ rules in `SymbioteFabricProps.cpp` mostly translate W3C-style RN props into Fabric props.
  - Examples: `inputMode` to keyboardType, `enterKeyHint` to returnKeyType, W3C `autocomplete` to textContentType, `srcSet`/`src` precedence, aria aliases, `numberOfLines`.
  - On web those are near-identity DOM attributes, so the web mapping is smaller than the C++ set. Real work: Text clamp, ScrollView wrapper and sticky headers, Pressable accessibility folding.

- F18 Of 68 `packages/*`, 52 wrap an Expo module whose upstream has a `.web.ts(x)` file (count only, content not audited; some may be stubs that throw).
  - No upstream web file: apple-authentication, glass-effect, intent-launcher, live-photo, navigation-bar, sms, splash-screen, standard-web-crypto, store-review, symbols, tracking-transparency.
  - Not Expo: android, cli, expo-modules-link, local-auth, navigation (react-native-screens port), reanimated, slider.
  - Per `symbiote-expo-native-module` the JS is ported into our core, so each web twin is a port of that package's `.web.ts`.
- F19 RNW text reference (`exports/Text/index.js`): `numberOfLines === 1` uses nowrap + ellipsis, `> 1` uses `-webkit-box` + `WebkitLineClamp`.
  - Nested text is `display: inline` with `color/font/textAlign/whiteSpace: inherit`. This maps `RCTVirtualText`.

- F20 The op stream is a public subpath: `@symbiote-native/engine/mutation-buffer` (`OP_*`, `NO_VALUE`, `OP_STRIDE`, `IMutationBatch`).
  - The decoder in `core/test-utils/src/recorded-tree.ts` is about 60 lines over 14 opcodes: six words per op, strings and values interned per batch, slots resolved through `batch.handles`.
  - A DOM `applyOps` is the same walk with `document.createElement` / `insertBefore` / `setAttribute` in place of array splices.
  - `OP_SET_TAG` carries the intrinsic tag (`pressable`, `text-input`, `switch`...). On web the tag plus props selects the DOM element and semantics, the web twin of the C++ tag rules.
- F21 A surface is one ordinary node (`createSurfaceRoot`, an AppContainer). `OP_COMMIT [rootTag, surface]` names it.
  - `adapters/react/src/bootstrap.ts` registers through RN's `AppRegistry` (`setHostRegistrar`). On web, `@symbiote-native/web` supplies `runApplication(name, {rootElement})` and maps `rootTag` to the DOM container.

- F22 `IPlatformOSType` already contains `'web'` (`core/engine/src/platform/shared.ts`). The platform folder follows folder-as-module (`index.ios.ts`, `index.android.ts`).
  - New files for web: `platform/index.web.ts` and `core/components/src/component-names/index.web.ts` (ios/android variants exist today).
  - 25 binary `Platform.OS ===/!==` sites exist. The milestone-relevant ones are single-sided (`=== 'android'`, `=== 'ios'`, `!== 'ios'`), so web falls to the safe branch.
  - Sites checked: `state/pressable.ts:374`, `behaviors/pressable.ts:208`, `scroll-view/responder.ts:85,263`, `text-input.ts:303,329`, `engine/node-props.ts:124`.
  - Still to audit: Modal (4 adapters), VirtualizedSectionList, Switch, Button, InputAccessoryView, TouchableNativeFeedback. All are outside the first milestone.
  - `Platform.Version` and `constants` need web values (UA-based). Getters already fall back to neutral defaults when `PlatformConstants` is absent.

- F23 Imperative commands the host's `dispatchCommand` must serve in the first milestone: `scrollTo`, `scrollToEnd`, `focus`, `blur`, `setTextAndSelection`.
  - `flashScrollIndicators` and `zoomToRect` are no-ops on web. `hotspotUpdate` and `setPressed` are ripple/feedback commands (Android feedback), also no-ops. `setValue` is the Switch command.
  - Known by name only so far. The argument shapes still need reading in `core/components/src/scroll-view-commands.ts` and `behaviors/text-input.ts`.

- F24 TextInput controlled handshake (`core/components/src/behaviors/text-input.ts:214,393`, `state/text-input.ts`).
  - Host emits `topChange` with `nativeEvent {text, eventCount}`; the host owns the counter.
  - Engine answers with `setTextAndSelection [eventCount, text, start, end]`; `-1` start/end means leave the caret.
  - Web rule: apply the command only when `eventCount` is not older than the host's latest emitted count (stale-safe), else drop it.
  - `topSelectionChange` comes from `selectionchange` / `selectionStart`/`selectionEnd`. `topFocus`, `topBlur`, `topSubmitEditing`, `topKeyPress`, `topEndEditing` map from DOM `focus`, `blur`, `keydown Enter`, `keydown`, `blur`.
- F25 Event names the host must be able to emit are tabled in `core/engine/src/events/names.ts`.
  - Bubbling: Focus, Blur, Change, EndEditing, SubmitEditing, KeyPress, KeyDown, KeyUp, Click.
  - Direct: Layout, Scroll, ScrollBeginDrag, ScrollEndDrag, MomentumScrollBegin/End, SelectionChange, ContentSizeChange, LoadStart, Load, LoadEnd, Error, Progress, TextLayout, Show, RequestClose, Dismiss.
  - Layout payload is `nativeEvent.layout {x,y,width,height}` (`readLayoutField` reads it). The sticky-header path in ScrollView depends on `y` and `height`.
  - Image load events (`loadStart`, `load`, `loadEnd`, `error`) are gated on a listener being wired (`anyImageLoadEventListenerWired`).
- F26 Touch is raw `topTouchStart/Move/End/Cancel`. The engine itself does the rest in JS: press, pressIn, pressOut, longPress (500 ms), responder negotiation (`events/responder.ts`), touch history.
  - So the web host only translates `pointerdown/move/up/cancel` into touch records `{touches, changedTouches, identifier, pageX, pageY, locationX, locationY, timestamp}` and aims them at a node.
  - No RNW `ResponderSystem` port is needed. F8 narrows to the reference for pointer to touch field mapping only.

## Risks to carry into the design doc

- R1 Gesture arbitration with the browser. `setIsJSResponder(handle, isResponder, blockNative)` must become `touch-action` / `preventDefault` / pointer capture, or a PanResponder inside a ScrollView fights native scrolling.
- R2 `onLayout` position is parent-relative in RN. DOM needs `ResizeObserver` for size plus a recompute of offsets on commit, because a sibling change moves a node without resizing it.
- R3 Scroll phases. Browsers have no `momentumScrollBegin/End` or `scrollBeginDrag/EndDrag`. Derive from `scroll`, `scrollend` and pointer state, and state the approximations.
- R4 Text selection and the IME. A controlled input that re-sets `value` can break composition. Needs a composition-aware guard.

- F27 Image. The host behavior carries no runtime (`behaviors/image.ts`). `routeProp` already resolves `source`, `src`, `srcSet` through `resolveAssetSource` before the host sees them (`resolvesImageSources`).
  - So the web host receives `{uri, width, height, scale}` shapes (or arrays) and picks the URL. The `srcSet`/`src`/`source` precedence rule is C++ today (`foldImageProps`), so web needs its own copy of that precedence.
  - RNW's approach (`exports/Image/index.js`): a `div` with `background-image`, a hidden `img` for natural size, `ImageLoader` for load/error events, an SVG filter for `tintColor`, CSS `blur()` for `blurRadius`.
  - Open design question Q9, see below.
- F28 Sticky headers (`behaviors/scroll-view/sticky.ts`) pin through a `transform` fed by an AnimatedValue of the scroll offset.
  - On web `isNativeAnimatedAvailable()` is false, so the JS path runs: `onScroll` at 16 ms throttle, one commit per frame. It works, bounded by main-thread commits.
  - A later web-native option is CSS `position: sticky`. Not in the first milestone.
- F29 Remaining `Platform.OS` sites classified for web (R5).
  - Switch `snapBackCommand`: android uses `setNativeValue`, others `setValue`. Web serves `setValue`. Fine.
  - Button and TouchableNativeFeedback: `IS_ANDROID` false on web, so the iOS-style path runs. Fine.
  - InputAccessoryView: iOS only. A no-op on web.
  - Modal (React/Vue/Solid/Angular): `handleDismiss` returns early unless iOS, so web needs its own dismiss semantics. Modal is outside milestone 1.
  - VirtualizedSectionList: `stickySectionHeadersEnabled` defaults to `Platform.OS === 'ios'`. The web default is a product choice, to decide when lists come in.

- F30 How the Expo examples run today, read in `examples/expo-react`.
  - `package.json` scripts use `react-native start` (RN CLI Metro), `metro.config.js` uses `@react-native/metro-config`, and `index.js` calls `registerApp` from `@symbiote-native/react/bootstrap`. There is no `expo start`, no Expo Router.
  - The `expo` package (57.0.14) is installed for native modules only.
  - The web alias and HTML shell belong to the Expo CLI (`@expo/cli`), not to Metro itself. RN CLI Metro knows only ios and android.
  - Per Expo docs (docs.expo.dev/guides/running-in-the-browser, read via search, not fetched): a bare project adds `react-dom`, `react-native-web`, `@expo/metro-runtime`, then `npx expo start --web` and `npx expo export --platform web`. Their entry uses `registerRootComponent`.
  - So D-Bundler implies a new `web` script per example (`expo start --web`) and a web variant of `registerApp` that mounts through `@symbiote-native/web` instead of `AppRegistry`.
  - Open for verification: whether `expo start --web` accepts our `@react-native/metro-config` plus the css-parser transformer. Needs a run, which is a build step the operator does.

- F31 Accessibility on web. aria-* and `role` reach the host as authored props (the RN fold into `accessibility*` runs in the payload builder, `engine/src/accessibility-props.ts`). RN-style props still need DOM mapping.
  - RN-style: `accessibilityLabel`, `accessibilityRole`, `accessibilityState`, `accessibilityValue`, `accessibilityHint`, `accessibilityLiveRegion`, `accessible`, `importantForAccessibility`, `testID`, `nativeID`.
  - RNW reference tables: `modules/AccessibilityUtil/propsToAccessibilityComponent.js` (role to tag: button, header, nav, ul, li, main, `h1`-`h6` by level) and `propsToAriaRole.js`.
- F32 Svelte conflicts with a real DOM (new risk R6).
  - `adapters/svelte/src/dom-shim/patch-globals.ts` overwrites `Node`, `Element`, `HTMLElement`, `Text`, `Comment`, `DocumentFragment`, `document`, `customElements`, `getComputedStyle`, `CustomEvent` on mount, restores on unmount.
  - It must stay for the whole mount: Svelte 5's runtime calls the bare globals at call time (`document.createTextNode`, `createComment`, `createDocumentFragment`, `importNode`) and reads `Element.prototype`/`Node.prototype` in `init_operations()`.
  - On a web page that replaces the browser's own `document` while the app is mounted, under the DOM host, Expo's web runtime and any other page code.
  - Other adapters are clear: Angular provides a stub `DOCUMENT` through DI (`render/index.ts:215`), no global patch; React, Vue, Solid patch nothing.
  - Mitigations to weigh, not decided: (1) the web host captures the real `document` and prototypes at install, before any patch, and only uses those; the caveat for other page code is documented. (2) Patch only around Svelte's synchronous work, which needs hooks into its scheduler. (3) A separate realm. Recommendation: (1) first, and measure what breaks with Expo's web runtime.
- F32b R6 follow-up research (it6, operator asked for more information before deciding).
  - Svelte 5.53.12 client runtime reads bare globals: `document.` x35, `window.` x7, `navigator.` x3, `Element.` x3, `Text.`, `Node.`, `getComputedStyle(`, `CustomEvent(`, `customElements.`, plus `queueMicrotask` x3, `requestAnimationFrame` x3, `MutationObserver`, `ResizeObserver`. Node creation is in `internal/client/dom/operations.js` and `template.js`.
  - Upstream: `sveltejs/svelte` PR #18042 "feat: custom renderers API" (`experimental.customRenderer`, `createRenderer` from `svelte/renderer`). OPEN since 2026-04-01, last commit 2026-04-14, `reviewDecision: REVIEW_REQUIRED`. A maintainer said on 2026-08-13 review waits for SvelteKit 3. Issue #15470 is open. No release date.
  - If it lands: no global patch at all. Limits per the PR: no `bind:` on elements, no `transition:`/`animate:`/`in:`/`out:`, no `svelte:window/body/document/head`, no `createRawSnippet`, no hydration. Our shim supports transitions today (`Element.animate()` replay in `dom-shim`), so switching later trades features.
  - Expo's web runtime (`@expo/metro-runtime`) reads `document` only in `getDevServer.ts` (`currentScript`). Blast radius of a global replacement is therefore page code that creates DOM nodes while Svelte is mounted (React DOM error overlay, other widgets). Not measured.
  - Options now: (1) host captures real DOM refs; (1b) as (1), plus the shim `document` becomes a delegating proxy that overrides only `createElement/createTextNode/createComment/createDocumentFragment/importNode` and falls through to the real document for the rest; (2) scoped patch around Svelte work, rejected as fragile because Svelte flushes on its own microtasks; (3) Svelte outside web milestone 1; (4) bundle-time rewrite of the bare DOM globals inside `svelte/internal/client/**` to imports of the shim module, done in the Svelte Metro transformer with a contract test that fails on an unlisted global; fixes native too; build-time change to a third-party runtime, so it needs the operator's yes; (5) wait for #18042.
  - My recommendation: (1b) now, (4) if the blast radius is measured as real, (5) as the long-term target. Not decided.
- F33 Parity test shape (design). One scenario per primitive, mounted on each of the 5 adapters over the same DOM host in a DOM environment, compared as normalized serialized DOM.
  - Normalize: drop anchors/comments, sort nothing, keep attribute order stable. Equality across adapters is the parity proof.
  - Existing precedent for cross-package contracts: `tests/*.test.ts` (for example `adapter-barrel-parity.test.ts`) read several packages and assert a contract.

- F34 `fabricProps(node, propsOf(node))` (`core/engine/src/fabric-props.ts`) is the reusable first step of the web mapping.
  - It returns one flat bag of the node's props.
  - Style slots are hoisted to top-level keys, later entries win, and an explicit undefined clears a key.
  - Functions and undefined values are dropped. Aria is folded. The behavior's `payloadFold` is applied.
  - Colors go through the injected `processColor`. On web `bootstrapHost({colorProcessor})` takes an identity function, so they stay CSS strings.
  - PlatformColor and DynamicColorIOS objects need a web processor later.
  - The host must then classify keys as style key, DOM attribute or RN-only prop.
  - RN's `Libraries/Components/View/ReactNativeStyleAttributes` is a pure list of style keys that can seed the style set. Unverified that it imports cleanly on web.
  - `recording-host.ts` `payloadOf` already uses `fabricProps` this way headlessly.
- F35 RN-semantic Text rules live ONLY in C++ (`SymbioteFabricProps.cpp`, around lines 654-735 and 2925-3000).
  - The TS twin `applyTextDefaults` was deleted (`committed-payload.itest.ts:86`), and `fabricProps` says not to add it back.
  - The web host is a new consumer and needs its own copy, asserted by a DOM-level contract test.
  - Defaults for a non-nested Text: `ellipsizeMode: 'tail'`, `allowFontScaling: true`, `overflow: 'hidden'` as a fallback under authored style. `accessible` is true on iOS and follows press handlers on Android.
  - `numberOfLines` negative or NaN resets to 0 (unlimited). `disabled` folds into `accessibilityState`.
  - A pressable, enabled Text with no role gets `accessibilityRole: 'link'`. `userSelect` becomes `selectable`. Numeric `fontWeight` becomes a string.
  - Nested Text (virtual) gets none of the defaults.
  - Web draft: `numberOfLines` 1 uses nowrap + ellipsis, above 1 uses line-clamp (RNW technique, F19).
  - `ellipsizeMode` tail maps to `text-overflow: ellipsis`, clip to `clip`. Head and middle have no CSS equivalent, so they approximate and are documented.
  - No web equivalent in milestone 1: `allowFontScaling`, `adjustsFontSizeToFit`, `textAlignVertical`, `includeFontPadding`.
  - Pressable Text becomes `role=link` with `tabindex=0` and Enter activation.

- F36 TextInput web mapping draft. Reference: RNW `exports/TextInput/index.js`.
  - Element: `multiline` picks `textarea`, else `input` (RNW line 368). `secureTextEntry` sets `type=password`. `inputMode` and `keyboardType` map to `inputmode` and `type` (email, tel, search, url, numeric, decimal). `enterKeyHint`/`returnKeyType` map to `enterkeyhint`.
  - Passthrough attributes: `autoCapitalize`, `autoComplete`, `autoCorrect`, `spellCheck`, `maxLength`, `readOnly`/`editable`, `rows` (or `numberOfLines`), `placeholder`.
  - `fabricProps` rewrites the controlled value for a TextInput into a private `text` key (`value ?? defaultValue`). The web host reads `text`, not `value`.
  - Events: `topChange {text, eventCount}`, `topSubmitEditing {text}` on Enter when not composing (`isComposing` or `keyCode === 229`, RNW line 88), `topSelectionChange {selection:{start,end}}`, `topKeyPress {key}`, `topFocus`, `topBlur`, `topEndEditing`, `topContentSizeChange` for multiline.
  - `blurOnSubmit` defaults to true for single-line, false for multiline. `selectTextOnFocus` selects on focus.
  - R4 rule (IME): while a composition is active (`compositionstart` to `compositionend`), a `setTextAndSelection` that would change the DOM value is deferred until `compositionend`. Writing `value` mid-composition cancels the IME.
  - Stale rule (F24) stays: a command with `eventCount` older than the latest emitted count is dropped.

- F37 Activation contract for Pressable, read in `core/components/src/state/pressable.ts:381-390` (`handleClick`).
  - A `topClick` whose `nativeEvent` has an own `pointerType` is pointer-born and ignored, because the touch sequence already pressed.
  - A click without `pointerType` is an accessibility or keyboard activation and calls `onPress`.
  - A click whose `currentTarget !== target` is a nested pressable's bubbling click and is stopped.
  - Web rule: emit `topClick` from the DOM `click`, and set `nativeEvent.pointerType` only when `event.detail > 0` (a real pointer click). `detail === 0` means keyboard or assistive activation, so the key is omitted.
  - A `div` with `role=button` or `role=link` and `tabindex=0` gets no click from Enter or Space in a browser. The host must synthesize it on `keydown` Enter (and Space for buttons) for such nodes. Native `button` and `a` would not need it, but the host picks `div`.
  - This also fixes the double-fire risk: without the `pointerType` guard a mouse click would run `onPress` twice.

## Defaults I will apply unless you override (D6: not decided for you, flagged)

- Q9 Image element: `img` with `object-fit` for cover, contain, stretch (fill) and center (none); a background-div fallback only for `repeat`.
  - Why: native `alt`, drag, context menu, SSR and `srcset`. RNW's div-only path loses those. Override if you want the RNW shape.
- Q6 Text: DOM text with the RNW clamp technique. `onTextLayout` later via Range rects.
- Q7 Native-module web twins are follow-on work per package, outside the first web milestone.

## Upstream surveyed (opensrc cache `~/.opensrc/repos/github.com/`)

- necolas/react-native-web 0.21.2: React-only. Reported maintenance mode, author moved to react-strict-dom.
- facebook/react-strict-dom main: StyleX plus a W3C-aligned subset. React Native compat is work in progress.
- lynx-family/lynx-stack `packages/web-platform/{web-core,web-elements}`: closest twin of the idea.
  - It implements the native-binding APIs on browser APIs.
  - The browser does CSS, layout and paint. Custom elements replace native elements. JS and CSS are shared.
- NativeScript: no web target found, native-only.

## Web search (2026)

- RNW is in maintenance mode. RSD is Meta's path. Lynx 3.9 (Aug 2026) ships web-aligned CSS.
- Sources: shift.infinite.red (RSD vs RNW), itnext.io (RNW maintenance), lynxjs.org/next/blog, github.com/lynx-family/lynx-stack.

## Decisions (operator, 2026-10-20 it1)

- D-Scope: web = a DOM implementation of `ITreeHost`, under the same engine, for all 5 adapters. No RNW dependency, no custom elements.
- D-Done: the deliverable is a design document plus decisions. No platform code. Verified spikes (tests) are allowed.
  - No `--completion-promise` is set, so the loop ends at 15 iterations. Do not self-cancel (D11).

- D-Bundler (it2): Metro through Expo for web. `react-native-web` is a peer of the web app and serves as the RN-module library only.
- D-Placement (it2): new package `@symbiote-native/web` (`core/web`) holds the DOM host. The engine stays the native core.
- D-Styling (it2): classes behave as in RN. The registry resolves them to styles, applied as inline or atomic CSS. No browser cascade, no real CSS passthrough.

- D-Tier (it2): first milestone = DOM host plus View, Text, Image, ScrollView, TextInput, Pressable on all 5 adapters, one shared parity test.
  - Lists, Modal, Animated and the rest come later. What is covered gets recorded in a project skill.
- D-Platform (it2): `Platform.OS === 'web'`, `Platform.select({web})`, `.web.ts` extensions. The OS type widens in `core/engine/src/platform/`.

- D-Spike (it4): WITHDRAWN by the operator right after. No code in this loop, spike included: "мы прорабатываем платформу, код пока не пишем".
  - Rule for the next iterations: design, research and grill only. No new packages, no dependency changes, no `pnpm install`, no test files.
  - Do not re-ask about a spike or `happy-dom`. The skill's note about a DOM test environment stays as an open item for the build phase.
  - Side effects I made before the stop (to revert on a yes): `core/web/{package.json,tsconfig.json}`, `happy-dom` in `pnpm-workspace.yaml` catalog and root `package.json`, then `pnpm install --ignore-scripts` (lockfile, node_modules).

- D-SSR (it5): operator asked whether Expo web / RNW support SSR and wants parity with them.
  - Facts (Expo docs `guides/publishing-websites.mdx`): `web.output` is `single` (SPA, default), `static` or `server`. The latter two render per route of the Expo Router `app` directory. A non-router app gets `single` only.
  - RNW has `AppRegistry.getApplication` for server rendering, React-only (react-dom/server, style sheet extraction).
  - So "like Expo web" for our apps means client-only. Treat SSR as a non-goal of milestone 1, no host constraint beyond not touching `document` at import time.
- D-Browsers (it5): operator: same baseline as RNW / Expo web.
  - Facts: neither states one. RNW uses `ResizeObserver` (`useElementLayout`), feature-detects `PointerEvent` (`modality`, `useHover`), and derives scroll end from a timer (`ScrollViewBase.js`, no `scrollend`). Expo's CSS prefixing follows the app's `browserslist`.
  - Adopt the same: evergreen, `PointerEvent` and `ResizeObserver` with detect, scroll phases from timers. This also confirms R3 has precedent.
- D-Examples (it5): operator: web must be available to ALL examples, not only the expo ones.
  - Fact: `angular`, `react`, `solid`, `svelte`, `vue-sfc`, `vue-tsx` have no `expo` package (checked in each `package.json`). `expo-*` examples do. `bare-rn` stays out (zero `@symbiote-native/*`).
  - Consequence: `expo start --web` cannot be the only driver. Open question Q10 below.

- D-WebDriver (it5): Expo CLI is the one web driver. `expo` and the web peers go into the 6 examples that lack them (`angular`, `react`, `solid`, `svelte`, `vue-sfc`, `vue-tsx`). `bare-rn` stays out.
  - Clarified to the operator that RNW is a module library with no dev server, HTML shell or Metro `web` platform. Options Vite/webpack and a homegrown Metro shell were offered and not chosen.
  - Unverified risk: `expo` in an RN CLI app may touch native builds. Native builds opt into Expo modules through the Podfile (`use_expo_modules!`) and gradle (`useExpoModules()`). Checking that needs the operator's build.
  - Unverified: `expo start --web` with `@react-native/metro-config` and the css-parser transformer.

- D-PageOwner (it7): the app owns the page, as in RN and an Expo web SPA. Embedding into a foreign page is explicitly not supported.
  - R6 resolved as option (1b): the web host captures the real `document` and prototypes at install, before any patch. The Svelte shim `document` delegates everything except node creation to the real one.
  - Upstream PR #18042 and the bundle-time rewrite (4) stay long-term targets, revisited if embedding is ever wanted.
  - Process note: the operator interrupted a tool call twice ("код пока не пишем", "продолжаем обсуждение svelte"). When a decision is open, discuss in text first and run no tools until asked.

## Open questions (-> grill-me)

- Q10 answered, see D-WebDriver. R6 answered, see D-PageOwner.

- Q1-Q5, Q8 and styling are answered, see Decisions.
- Q6 Text: DOM text vs measured text. How `onTextLayout`, `numberOfLines`, `ellipsizeMode` map.
- Q7 Which native-module packages (`packages/*`) get a web twin, in which order.
- Q2 Bundler for web: Metro-web via Expo, or Vite. Constrained by F3.
- Q3 Placement: new package `@symbiote-native/web` host, or inside the engine. Tier per `symbiote-new-package-skeleton`.
- Q4 Done-criterion for this loop.

## Remaining work

- Read RNW internals worth lifting: style compile, createDOMProps, text, scroll, responder, TextInput, Image.
- Read Lynx web-core main-thread element mapping and events. Read RSD props and style model.
- Enumerate the viewNames the engine emits (RCT*) and draft a viewName to DOM map.
- Enumerate Yoga-vs-CSS divergences. Enumerate native modules needing web twins (`packages/*`, expo wrappers).
- Check Expo/Metro web support in vendored expo. Check css-parser output reuse as real CSS.

## Design doc outline (the deliverable, D-Done)

1. Goal and non-goals (no RNW dependency, no custom elements, no Worker split).
2. Seam: DOM `ITreeHost` (`applyOps`, reads, measure, dispatchCommand), size reference `test-utils` recorded-tree + recording-host (~19K).
3. viewName to DOM map (F6) and the RN-props to DOM mapping (replaces the C++ tag rules on web).
4. Layout: browser CSS plus the Yoga-default reset (F11). Enumerate the remaining divergences.
5. Events: DOM pointer/keyboard/scroll to the engine's event payloads and the JS responder path.
6. RN-module host object (F10): RNW as optional module library, or own shims.
7. Styling: pass real CSS through, or keep the registry (F7). Open for the operator.
8. Bundler and `react-native` peer (F3, F3b, F4). Probe H1 first.
9. Packaging: where the host lives (Q3) and the adoption tier.
10. Test strategy: jsdom/happy-dom TDD, shared adapter parity suite, what only a browser can prove.

## Iteration log

- it1: ledger created. F1-F11 established. Upstream vendored (RNW, RSD, Lynx). Searches done. Q1 and Q4 answered by the operator.
- it1 next: Q2 (bundler), Q3 (placement), styling semantics (F7). Probe H1. Enumerate events payload shape and Yoga-vs-CSS list.
- it2: H1 resolved (F12). F13-F22 added. Operator answered Bundler, Placement, Styling, Tier, Platform.OS. Q6, Q7 defaulted.
- it2 next: audit the first-milestone primitives against the DOM (ScrollView commands, TextInput handshake, Image events, measure/onLayout). Then write the design doc into a project skill via SkillForge (ask where first).
- it3: F24-F26 and R1-R4 added. Design v1 written to `.claude/skills/symbiote-web-platform/SKILL.md` (hooks-check: no findings).
  - SkillForge's panel uses subagents, which D1 forbids, so the skill was authored directly in the sibling format. Tell the operator.
  - Untracked: skill dir and this ledger. Nothing committed (no ask yet).
- it3 next: audit ScrollView wrapper + sticky headers and Image on DOM; Switch/Modal sites (R5). Consider a spike: DOM `applyOps` on a minimal fake DOM, TDD, to prove F1/F20 before the DOM test env is chosen.
- it4: operator stopped the spike ("код пока не пишем"). Side effects listed under D-Spike. Revert question still unanswered.
- it5: Image (F27), sticky (F28), Platform sites (F29), example setup (F30) added. Operator answered SSR, browsers, examples, web driver (D-SSR, D-Browsers, D-Examples, D-WebDriver). Skill updated, hooks-check clean.
- it5 next: Text/accessibility mapping, Modal and Animated on web (outside milestone 1, only note), parity-test shape across 5 adapters, gesture arbitration R1 design. Ask the operator about the revert only once more, at the end of a report.
- it6: F31 (a11y), F32/F32b (Svelte shim vs real DOM, R6), F33 (parity test shape) added. Gesture arbitration R1 designed in the skill. Operator asked for more information on R6 before choosing; findings delivered, decision still open.
- it6 next: wait for the R6 answer. Meanwhile Text/accessibility mapping table, Modal/Animated notes, `@symbiote-native/cli` scaffolding for web (cli package exists: `packages/cli`).
- it7: R6 resolved (D-PageOwner, option 1b). Process note recorded: discuss open decisions in text, no tools.
- it8: F34 (fabricProps as step one of the web mapping), F35 (Text rules exist only in C++, web needs its own copy) added to ledger and skill. Rejected: compiling `SymbioteFabricProps.cpp` to WASM (folly::dynamic dependency, no gain over a 100-line TS copy).
- it8 next: TextInput web mapping (inputMode, secureTextEntry, multiline, selection, IME R4), Modal and Animated notes, `@symbiote-native/cli` web scaffolding (`packages/cli`).
- it9: F36 (TextInput web mapping, IME rule) and F37 (Pressable activation contract via `pointerType`) added to ledger and skill. The `detail > 0` discriminator is from DOM semantics, to verify in a real browser.
- it9 next: implementation roadmap (ordered slices with a verification per slice), Modal and Animated notes, `@symbiote-native/cli` web scaffolding, performance model of DOM ops per commit.
- it10: roadmap (slices 0-7, a verification each) added to the skill. `tests/` checked: bundle-matrix test needs only the own adapter in each example, parity test compares screen literals, so neither blocks `@symbiote-native/web` or `expo` in examples.
- it10 next: Modal and Animated notes, `@symbiote-native/cli` web scaffolding, DOM op cost model per commit.
- it11: Modal and Animated notes added to the skill. Animated falls to the JS driver (no NativeAnimatedModule on web). Modal on web is `dialog` plus `showModal()`, with a fixed-div fallback.
- it11 next: `@symbiote-native/cli` web scaffolding, DOM op cost model per commit.
- it12: DOM cost model and CLI web layer (`hasWeb` in `CORE_LAYERS`, fragment, template) added to the skill. Both marked as design, unmeasured.
- it12 next: re-verify the skill against code (D9), list operator-run checks in one place, confirm Q9 Image element.
- it13: D9 check of paths cited in the skill: all exist, the missing ones are planned files. Q9 confirmed against RNW source. Operator-run checks listed in one section.
- it13 next: final consistency pass over skill and ledger, summary of the design for the operator.
- it14: consistency pass over the skill: decisions table, seam, pipeline match the ledger. Open for the operator: revert of the spike side effects, DOM test env (`happy-dom` vs `jsdom`, slice 0), browser checks.
- it14 next: last iteration. Hand the operator the summary and the exact list of what needs their yes or their run.
- it15: operator answers. Revert of spike side effects: NO, keep `core/web` and `happy-dom` as groundwork for slice 0. DOM env: `happy-dom`. Commit of skill and ledger: not now.
- it15 note: the kept side effects stay uncommitted in the working tree (`core/web`, `happy-dom` in the catalog and root `package.json`, lockfile).
- post-it15: on the operator's request, `expo` 57.0.14, `react-dom` 19.2.3, `react-native-web` ~0.21.0 and `@expo/metro-runtime` ~57.0.3 were added to the 6 example manifests, plus a `web` script (`expo start --web`). Versions from SDK 57 `bundledNativeModules.json`. No install, no build.
- operator run 1: `npm run web` in `examples/react` bundled 1292 modules, then failed with Expo's native-only guard (R7). Chain: `App.tsx` imports `@symbiote-native/navigation/react`, whose `register.js` imports `react-native-screens/src/fabric/SearchBarNativeComponent`, which imports `RendererProxy` and the Fabric renderer.
- R7 proposed: a `register.web.ts` no-op per package with a `register.ts`. Navigation stays out of milestone 1: superseded by D-Packages. The web smoke app must not import navigation. Not yet written, awaiting the operator.
- D-Packages (operator, after run 1): navigation is needed, and every package gets an optional DOM twin. Supersedes the R7 proposal to keep navigation out. Placement of the twin (in-package `.web.ts` or separate packages) is open, default proposed: in-package.
- D-WebExamples (operator): navigation is mid-port, so web gets `examples/web-<fw>` apps with only the canary screen, starting with react. Navigation is adapted package-first later, and that unblocks the rest.
- `examples/web-react` created: canary graph copied from `examples/react` (no navigation), `package.json`, `app.json`, `index.js`, `App.tsx`, babel and metro configs, README. Not installed, not run.
- Known blockers for `web-react`: no DOM host, no web `registerApp` variant, and `@symbiote-native/slider/react` hits R7 (CanaryControls uses `Slider`).
- `canary-examples.mjs` now excludes `web-*` (the packed-bundle matrix is native only). Root `tests/` pass, 2254.
- R7 first fix: `packages/slider/src/register/index.web.ts`, a no-op that skips the native spec (test `register.web.test.ts`, changeset added). The slider has no DOM twin yet, and its fallback `registerComponent` is skipped on web.
- Next `web-react` blockers after the slider: the DOM host and the web `registerApp`.
- operator run 2 (`examples/web-react`, `npm run web`): bundled 694 modules in 6 s, page loads at localhost:8081 and `#root` stays empty. Check 2 passes. Expo warned about `expo-asset` exports (harmless fallback).
- Blank page is expected: nothing calls `AppRegistry.runApplication` or installs a tree host on web. Browser console is clean: `registerApp` runs without errors on web and mounts nothing.
## Implementation log (ralph loop 2, 25 iterations, TDD)

- L1 slice 1 done: `core/engine/src/platform/index.web.ts` (`Platform.OS` is 'web', `select` skips `native`) and `core/components/src/component-names/index.web.ts` (iOS table). Tests green, platform 45 and names 5.
- L1 side fix: `IPlatformConstantsIOS` became a `type` (a hook owed it after a comment edit in `index.ios.ts`).
- L2 `core/engine/src/mutation-walk.ts`: `walkOps(batch, visitor)` decodes the wire once (new subpath `@symbiote-native/engine/mutation-walk`, both export maps). `core/test-utils/src/recorded-tree.ts` now uses it, and records a void node like an anchor (it threw before).
- L2 why a new file: touching `mutation-buffer.ts` owed 8 old long sentences as boy-scout debt, and the walk needs no buffer state.
- L2 verified: `core adapters` suites 7430 tests green except the css-parser corpus listing, which gained `examples/web-react/App.css` (snapshot refresh, see next line).
- L2 snapshot: `golden-corpus` listing refreshed with `examples/web-react/App.css` (the example is a real compiled source).
- L3 `core/engine/src/retained-tree.ts` (was `tree-reads.ts`): `createTreeReads(nodeOf)` is the read half of a tree host. `recording-host.ts` uses it.
- L3 `core/engine/src/retained-visitor.ts`: `createRetainedVisitor(store, effects)` is the write half (unlink, adopt, root-tag marking). Both subpaths are in the engine export maps. `recorded-tree.ts` and the DOM host sit on it.
- L3 `IRecorded` moved to `recorded-tree.ts` (re-exported by `recording-host.ts`), which removed an import cycle between the two.
- L4 `core/web` DOM host: `createDomHost({document})` plus `registerRoot`. Structure ops, anchor flattening, void, element swap, reads and census are covered by 14 happy-dom tests. `DOM_NODE_KIND` was dropped for the engine's `RETAINED_KIND`.
- L4 verified: `tsc --build core/engine core/test-utils core/web` clean, `core adapters` 7461 tests green, hooks-check clean on the touched files.
- L4 open: `swapElement` must re-apply props once slice 3 exists. Commands, accessibility, measure and the responder handover are no-ops with a TODO.
- L5 slice 3a, props to DOM for views, 107 tests in `core/web` incl. `dom-host.props.test.ts` driven by the real engine node API. New: `retained-visitor` effect `propChanged`, `css-style.ts` (table `style-table.ts`, exhaustive over `ITextStyle`), `css-values.ts` (transform, filter, boxShadow), `css-shadow.ts`, `dom-attributes.ts`, `dom-spec.ts`, `element-props.ts` (diff apply), `reset-sheet.ts` (one `<style>` per document), `view-tags.ts` (`viewFamilyOf`).
- L5 decisions taken without asking: view shadow only above zero `shadowOpacity` (iOS parity, opacity folded with `color-mix`); `pointerEvents` as classes; `lineHeight` number is px; flex per Yoga (grow n, shrink 0, basis 0).
- L5 known gaps, written as `none` or skipped in `style-table.ts`: `elevation`, `borderCurve`, `textAlignVertical`, `includeFontPadding`, `experimental_backgroundImage` as an array, `accessible`, `hitSlop`. Skipped keys go to `onSkipped`, not yet to a `dlog`.
- L6 Text: nested text renders as `span` (`text-context.ts`, sticky context ended by a plain view, as the native commit walk does); `text-rules.ts` has numberOfLines, ellipsizeMode, selectable. Decision: text stays selectable unless `selectable` is false, overflow is not clipped by default.
- L6 slice 4 first cut: `dom-events.ts` forwards pointerdown/move/up/cancel as `topTouch*` (one `touches` list, ids from 0, a touch keeps its start node, pointer capture on the container) and click as `topClick` (`pointerType` only when `detail > 0`). Page coordinates are `clientX` plus scroll, `locationX` from the start element rect.
- L6 slice 5: `bootWebHost` and `runOnWeb` in `core/web`, `installInertFabricSlot` shared with the recording host, `core/components/src/bootstrap/{shared,rn-seams,index.web}.ts`, React `register-app/{index,index.web}.ts` behind a `bootstrap.ts` hop. Reason for the hops (`bootstrap-entry.ts`, `bootstrap.ts`): an `exports` target gets no platform extension in Metro, a relative import does. Needs the operator's browser run to confirm.
- L6 packaging: `@symbiote-native/web` is an optional peer plus dev dependency of `@symbiote-native/react`, and the package is still `private`. It must be made public with a changeset before the React adapter is released.
- L6 verified: `tsc --build` clean for engine, components, web, test-utils, react. `core adapters` 7478 tests green. Three Angular tests fail only under full-run load and pass alone.
- L6 hook note: the reuse check crashed once with `alike() takes 2 positional arguments but 5 were given` after a Write. It is a hook defect, not a finding, and I did not touch it.
- L6 next: Image, TextInput, ScrollView props and their events (scroll, input, focus, key), `dispatchCommand`, `measure`, `setIsJSResponder`; the other four adapters' web entries; parity test across adapters.
- L7 `onLayout`: `layout-watcher.ts` (`ResizeObserver`, frame from `offset*`, silent when detached), `node-watching.ts` (watch while the bag says `onLayout: true`, release on removal, re-watch a moved node at the end of the batch). `bootWebHost` sends `topLayout` with `{layout}`. Tests: 5 + 4 + 1, `core/web` 151 green, `tsc --build core/web adapters/react` clean.
- L7 known gap: `ResizeObserver` fires on size change only, so a move without a resize reports nothing. RN also reports `x`/`y` change, and `offsetLeft/Top` is relative to `offsetParent`, not always the parent view. Needs a real browser check.
- L7 test note: a boot test must dispose every root in `afterEach`, or the next host is told about stale nodes.
- L8 ScrollView: `scroll-rules.ts` reads the intrinsic tag (`domSpecOf` got a 4th param `tagName`): axis classes in `reset-sheet.ts`, `scrollEnabled` false = `overflow: hidden`, hidden bars via `sn-no-scrollbar`. `direct-events.ts` (capture on the container) sends `topScroll` with offset, sizes, inset, zoomScale, only to a node that has a `scroll` listener.
- L8 Image: `image-rules.ts` (srcSet over src over source as in C++, a multi-scale `source` becomes `srcset`, `resizeMode` becomes `object-fit`, `alt`). `direct-events.ts` also sends `topLoad`, `topError` and `topLoadEnd` per listener.
- L8 imperative: `dom-imperative.ts` has `scrollTo`, `scrollToEnd` (by axis), `focus`, `blur`, `measure`, `measureInWindow`, `measureLayout`, `getBoundingClientRect`, a11y `focus`. `flashScrollIndicators` is dropped. `setIsJSResponder` is still a no-op.
- L8 gaps: `topLoadStart` (no DOM event), `scrollBeginDrag`/`EndDrag`/`momentum*`, `repeat` resize mode, `scrollEventThrottle`, `RefreshControl`, sticky headers, `contentOffset` prop. `apply-dirty.ts` was split out of `dom-host.ts` (import count).
- L8 verified: `core/web` 188 tests green, `tsc --build core/web adapters/react` clean.
- L9 TextInput: `view-rules.ts` is now the one place per-view rule sets (text, scroll, image, input) own their props and write class/css/attributes (`domSpecOf` shrank to the composer). `input-rules.ts` maps `keyboardType`/`inputMode`, `returnKeyType`/`enterKeyHint`, `secureTextEntry`, `editable`/`readOnly`, `autoCorrect`, `autoComplete`, `maxLength`, caret and placeholder colors; the web spelling wins as in the C++ fold. The start value is seeded once (`apply-dirty.ts`), later writes come only through `setTextAndSelection`.
- L9 handshake: `input-state.ts` keeps a per-handle event count and a composition flag. `input-events.ts` sends `topChange {text, eventCount}` (count moves even with no listener), `topFocus`, `topEndEditing`, `topBlur`, `topKeyPress` (printable, Enter, Backspace, Tab), `topSubmitEditing` (single line only), `topSelectionChange` (document `selectionchange`). `input-text.ts` drops a write older than the count and never writes during a composition.
- L9 gaps: `blurOnSubmit`/`submitBehavior` on Enter, `selectTextOnFocus`, `clearTextOnFocus`, `autoFocus` (the behavior focuses by command, unchecked on web), `topContentSizeChange`, `maxLength` on a controlled write, a multiline `submitBehavior: 'submit'`.
- L9 verified: `core/web` 221 tests green, `tsc --build core/web adapters/react` clean.
- L9 next: run the whole suite, then the other four adapters' web entries and the cross-adapter parity test.
- L10 start-up redesign: no per-adapter web entry. `startApp(host, appName, provider, options)` lives in `@symbiote-native/components/bootstrap` (native: `bootstrapHost`, registrar, `registerComponent`; `index.web.ts`: `bootstrapHost` then `runAppOnWeb`). All five adapter `bootstrap.ts` call it. Reason: the reuse hook blocked near-identical `createApp` copies per adapter.
- L10 `core/web`: `runAppOnWeb(registry, appName, provider, options)` (register, find `#root`, boot, `runApplication`) and `canary.ts` (`renderCanaryOnWeb` returns `CANARY_FACTS`-shaped facts read off the page; export `@symbiote-native/web/canary`).
- L10 parity: each adapter has `web-canary.web.test.ts` (React JSX, Vue `h`, Solid JSX, Svelte compiled source, Angular JIT component) asserting the same `CANARY_FACTS`. All five green.
- L10 real defect found by Svelte (R6 confirmed): its `patchGlobals` swaps `document`, `Node`, `Element`, `HTMLElement`, and `defaultView` is `globalThis`, so `instanceof` against a global or `view.X` failed and events and styles were silently dropped (empty page, no error). Fix: `dom-guards.ts` tells nodes by `nodeType`, `namespaceURI` and `localName` (`isNode`, `isElement`, `isHtmlElement`, `isTextField`, `isImage`). Test: `foreign-globals.test.ts`. Same hazard in a real browser, not only in happy-dom.
- L10 verified: `core adapters` 7645 tests green (956 files), `tsc --build` clean for web, components and the five adapters.
- L11 `autoFocus` on TextInput writes the `autofocus` attribute (`input-rules.ts`). A browser focuses a field inserted with it. `core/web` 228 tests green, tsc clean. `blurOnSubmit` and `submitBehavior: 'submit'` are read on Enter in `input-events.ts` (single line blurs by default). `selectTextOnFocus` and `clearTextOnFocus` run after `topFocus` (a clear dispatches `input`, so the app hears `topChange`). `maxLength` now also cuts a `setTextAndSelection` text (`input-text.ts`). TextInput gap left from L9: `topContentSizeChange`.
- L12 keyboard activation: `dom-keys.ts` (`forwardKeyActivation`, wired in `boot.ts`) clicks an element with `role` button on Enter and on the release of Space (the press only calls `preventDefault`), a link on Enter. The click goes through the existing `click` path, so the app gets `topClick` with no `pointerType`. `core/web` 239 tests green. Still open: the Text-pressable `role=link` default and `tabindex` for it, and `setIsJSResponder`.
- L13 `setIsJSResponder`: `gesture-claim.ts` keeps the claim (set only when the app is responder and asked to block native), `dom-gestures.ts` cancels a `touchmove` on the container (non-passive) while it stands. Tests in `dom-gestures.test.ts` (4, synthetic events). Not done: `touch-action` per node from the owned-listener ops (a claim made after the browser began panning arrives as `touchcancel`), and the `setPointerCapture` on mouse. Needs a real touch device to confirm, a synthetic DOM cannot pan.
- L14 decision (operator, grill-me): the web host carries the FULL twin of the C++ pressable rule (`usesPressableRule` tags: pressable, touchable-opacity, touchable-highlight, button, checkbox; feedback-key strip, three-leg `focusable` for touchables, Button's disabled precedence), plus `role=link` for a pressable Text. Not the a11y minimum.
- L14 slice 1 done: `pressable-rules.ts`, wired as two rule sets in `view-rules.ts`.
  - Tags pressable, touchable-opacity, touchable-highlight, button and checkbox get a default `role` (button, checkbox for checkbox).
  - They get `tabindex`: plain form for pressable and checkbox, press-gated for touchables and button.
  - `aria-disabled` comes from `disabled`. The machine and feedback keys are owned, so they are not reported as skipped.
  - A text with a press listener that is not disabled is `role=link` `tabindex=0`.
  - An authored role, `focusable` or `accessibilityState` wins over the rule, as the generic writers run last.
  - `bagOf` adds `hasPressListener` from `node.ownedListeners.press`.
  - `retained-visitor.ts` names a node dirty when an owned listener changes, so a press wired after the first commit lands.
  - Tests: `pressable-rules` 14, `dom-host.pressable` 3, `retained-visitor` 1.
- L14 slice 2a done: the Button label (`button-rules.ts`, `node-bits.ts`).
  - The label gets the iOS look (blue 18px centered text, margin 8, grey while disabled, tinted by the button's `color`). Web follows the iOS table, as the component names do.
  - `derivedBitsOf` hands the label its button's `color` and disabled state as the derived key `buttonOwner`.
  - `addDependents` (called from `applyDirty`) restyles the labels under a button that changed.
  - `disabledOf` now has Button's precedence: `disabled ?? aria-disabled ?? accessibilityState.disabled`.
  - Tests: `button-rules` 5, `dom-host.button` 3.
- L14 slice 2b done for Checkbox: `checkbox-rules.ts`.
  - Style is composed in upstream's order (base, the app's, checked, tint, disabled), so a rule set can now own the style keys (`ownsStyle` in `view-rules.ts`).
  - `value` becomes `aria-checked` unless the app wrote one. The mark (`checkbox-mark`) is absolute-filled and hidden until its owner is checked.
  - `node-bits.ts` now holds a table of control and part pairs (button and label, checkbox and mark). It feeds the part its owner's bits and restyles the parts of a changed control.
  - Tests: `checkbox-rules` 16, `dom-host.checkbox` 3. Breaking `addDependents` turns the late-change tests red.
- L14 slice 2c done for the TouchableHighlight underlay: `highlight-rules.ts`, `node-bits.ts`.
  - The box gets the derived key `underlay` (shown, has a color, the color). Shown means `testOnly_pressed`, or pressed with a press handler.
  - A shown underlay paints `underlayColor` over the app's `backgroundColor`, black when none is given, nothing for `null`.
  - The single child gets `highlightChild` and dims to `activeOpacity` (0.85 by default). `addDependents` marks the children of a changed highlight.
  - `setUnderlayShown` now names the node dirty through `writeAndName`, like the other owned-state writers.
  - `IRuleSet.applies` takes the bag, as the child rule applies by a derived key.
  - Tests: `highlight-rules` 8, `dom-host.highlight` 4, `retained-visitor` 1. Full suite 966 files, 7720 tests green, `tsc --build` clean.
- L14 slice 2d done: `aria-precedence.test.ts` (10 tests), `IRuleSet.fold` in `view-rules.ts`.
  - `attributesFromBag` writes `aria-*` keys last, so an alias beats the canonical prop in any key order.
  - `foldDisabledIntoState` (pressable tags and pressable text) writes a direct `disabled` over the state's field and keeps the rest of the state.
  - `foldButtonAccessibility` (Button): an empty `aria-label` falls through to `accessibilityLabel`, `importantForAccessibility` `no` hides descendants.
  - Full suite 971 files green apart from two Angular files that failed under load and pass alone (72/72), the known flake.
- L15 skipped props are logged: `applyDirty` passes `onSkipped` to `domSpecOf` only under `isDebug()`, as a `dlog` thunk naming the prop. Test `dom-host.skipped.test.ts` (3), `core/web` 312 green.
- L16 multiline `topContentSizeChange`: `sendContentSize` in `input-events.ts` sends `{contentSize}` on an `input` event when `scrollWidth`/`scrollHeight` moved, textarea only. Tests: `input-events.test.ts` (3 added). A resize without typing (a width change that rewraps) is not seen.
- L17 scroll phases: `scroll-phases.ts` (`forwardScrollPhases`, wired in `boot.ts`), 7 tests.
  - A scroll with a finger down sends `topScrollBeginDrag`, the last finger lifting sends `topScrollEndDrag`.
  - A scroll with no finger sends `topMomentumScrollBegin`, and the DOM `scrollend` ends it with `topMomentumScrollEnd`. A scripted scroll counts as a glide too, as on a device.
  - Not sent: `velocity`/`targetContentOffset` in the payload, and a mouse drag of the scrollbar. `scrollend` needs an evergreen browser (Safari 26.2+).
- L18 image `topLoadStart`: `applyDirty` calls the host option `onLoadStart` when an `img` got a new `src`/`srcset`. `bootWebHost` sends it as a microtask to an app that listens, so a reacting app does not re-enter the commit. Tests: `image-load-start.test.ts` (5). A src set before the listener was wired is not announced.
- L19 ScrollView props: `scroll-rules.ts`, `reset-sheet.ts`, tests in `scroll-rules.test.ts` (4 added).
  - `pagingEnabled` adds `sn-snap-x` or `sn-snap-y`: `scroll-snap-type` mandatory, and `scroll-snap-align: start` on the children of the content view (the pages).
  - `bounces: false` writes `overscroll-behavior: none`.
  - Owned and silent, as a page has no twin: `scrollEventThrottle`, `decelerationRate`, `alwaysBounce*`, `directionalLockEnabled`, `nestedScrollEnabled`, `overScrollMode`, `persistentScrollbar`, `fadingEdgeLength`, `endFillColor`, `indicatorStyle`.
  - Still reported as skipped: `snapToInterval`, `snapToOffsets`, `snapToAlignment`, `contentOffset`, `centerContent`, `contentInset`, `maintainVisibleContentPosition`, `zoomScale` family.
- L20 real components on a page, React: `adapters/react/src/web-components.web.test.tsx` (4) taps a `pressable`, ignores a disabled one, types into a `text-input`, scrolls a `scroll-view`. `mountOnWeb` in `canary.ts` returns the page for it.
  - Found and fixed: the engine registers its event handler once per process, and each `bootWebHost` made a fresh slot with none, so a second boot (a second test, HMR) lost every event. `fabric-slot.ts` now keeps the handler at module level. `fabric-slot.test.ts` (3).
  - `onChangeText` of the `text-input` tag gets the event with a `text` field, not the string.
  - The same four scenarios run on all five adapters, each in its own idiom: `adapters/{react,vue,solid,svelte,angular}/src/web-components.web.test.*`.
  - Gestures come from `@symbiote-native/web/interactions` (`tapElement`, `typeInto`, `scrollElementTo`, `elementByTestId`), a new subpath of `core/web`.
  - Idiom notes: Angular reads a field through `(change)` with `$event.nativeEvent.text`, `onChangeText` is a prop read by the behavior. Svelte tests restore the patched globals after each case with `restoreGlobals`.
  - Full suite 980 files, 7775 tests green.
- L21 Button title and teardown between pages:
  - Bug: the title of a Button reaches its label as a `setProp` of `text` on a raw text node, which the retained visitor took for a plain prop, so the label stayed empty.
  - Fix in `core/engine/src/retained-visitor.ts`: `setProp` of `text` on a raw text node fires `textChanged`, an element keeps `text` as a plain prop. Two tests in `retained-visitor.test.ts`.
  - Bug: a page had no way to stop a React surface, `unmountApplicationComponentAtRootTag` has no host registrar on the web. A Button tree left from one test then flushed ops into the next host (`applyOps: handle names no node`).
  - Fix in `core/web/src/canary.ts`: `disposeCanary` is async, it calls the registry unmount and the adapter's `RN$stopSurface`, awaits `settle()`, then `disposeRoot`.
  - Bug: the engine's op buffer is global. A write queued after a page was torn down (Solid, Angular after the Button case) was applied to the next page's host, which does not know the node.
  - Fix in `core/web/src/boot.ts`: `bootWebHost` drops the pending batch (`takeBatch`) when it replaces an installed host. Test in `boot.test.ts`, red without the fix.
  - Not done in `setTreeHost`: 95 symbols and many suites swap hosts, so the engine keeps its semantics.
  - The Button case now runs on all five adapters (`textLeaf` in `interactions.ts` finds the painted title). Suite 7784 tests green, `tsc --build` clean.
  - Left as is: a real web app has no caller of `unmountApplicationComponentAtRootTag`, the page ends with the tab and Fast Refresh calls `RN$stopSurface` itself.
  - Not done on purpose: a web fallback in `createAppRegistry` (the function is already over the distance limit) and a registrar from the web `startApp` (`bootstrap.web.test.ts` asserts it hands none).
  - The React case set now holds Button and TouchableHighlight too.
- L22 next slice (operator, grill-me): Switch and ActivityIndicator get DOM twins now, Modal waits.
  - Found by a probe: both painted an empty `div` on a page, `FlatList` rows render fine.
  - Done in `core/web/src`: `spinner-rules.ts` (iOS gray ring, 20/36/number px, `animating`/`hidesWhenStopped`, role progressbar), `switch-rules.ts` (51x31 pill, thumb by class, track colors, disabled), `switch-events.ts` (click sends `topChange` with the opposite `value`), Space on a `switch` role in `dom-keys.ts`.
  - `view-rules.ts` got `ofTag` so the per-tag rule sets stop repeating one shape (button label, checkbox, mark, highlight moved onto it).
  - The same two page cases run on all five adapters (`clickElement` in `interactions.ts`). React also proves a refused toggle stays off.
  - Suite 979 files, 7814 tests green, `tsc --build` clean.
  - Not done: Switch drag-to-toggle, `Switch` on Android look (iOS table only), Modal.
- L23 ScrollView `contentOffset`: written once as the scroll position when the element first gets its spec (`seedElement` in `apply-dirty.ts`, which also holds the field's initial value), never again so the user's place stays.
  - `applyDirty` was over the cognitive limit after the change, so the seeding moved out under one name.
  - `centerContent` is a class: an auto margin on the content child centers small content and falls back to the start when it overflows.
  - Left: `snapToInterval`/`snapToOffsets` (CSS snaps to children only), `contentInset`.
  - Known style gaps are written into the "Styles" section of the skill: `borderCurve`, `elevation`, `textAlignVertical`, `includeFontPadding` (kind `none` in `style-table.ts`) and `hitSlop` (reported, not written).
- L14 closed: Checkbox now reads the `disabled` prop alone, as `foldCheckboxProps` in C++ does (`aria-disabled` and `accessibilityState.disabled` no longer grey the box). Test in `checkbox-rules.test.ts`.
- L26 next slice (operator, grill-me): Modal gets a DOM twin. Host view name on web is `ModalHostView` (iOS table), the container child is a flex fill with white background.
  - Probe: before the work a Modal painted in flow as an unsized absolute box.
  - `modal-rules.ts`: the host is `position: fixed` over the page with `z-index` 1000 (the rule composes the app's style under that box), `role=dialog` and `aria-modal`, fade and slide entrances as classes, the native window props owned.
  - `modal-events.ts`: Escape on the document sends `topRequestClose` to the topmost modal that listens.
  - Page cases on all five adapters: a visible Modal covers the page and closes on Escape, a hidden one paints nothing. Svelte compiles the real `index.svelte` next to itself and uses `page.ownerDocument` because it swaps the global `document`.
  - Suite 982 files, 7838 tests green, `tsc --build` clean.
  - Not done: a real portal (a Modal under an ancestor with `transform`, `filter` or an opacity stacking context is clipped or layered under it), `onShow`, focus trap and focus return, the backdrop click, `presentationStyle` sheets.
- L25 RefreshControl probed on a page: it paints no element, `onRefresh` never fires, nothing else breaks. Pull-to-refresh is a gesture design of its own (the skill's "RefreshControl" section), left for the operator to rank.
- L24 `@symbiote-native/web` ready to publish, nothing published:
  - `core/web/package.json`: `private` gone, repository fields, `files: ["build"]`, `publishConfig` pointing at `build/` as the engine does, `core/web/README.md` added.
  - Changeset `.changeset/web-platform-package.md` (minor, so 0.0.0 becomes 0.1.0, default of mine).
  - Checks: `clean:build`, `typecheck`, `fix-esm-extensions` (the web build gets `.js` specifiers), `deps:check` and `tests/` (103 files) green. A stale `build/` had tripped `build-output-has-no-orphans`, `clean:build` fixed it.
  - Yours: the first npm publish and the trusted-publisher setup for the new name (`scripts/trust-publishers.mjs`), plus `check:bundle-isolation` on a packed consumer.
- Before the first commit: `pnpm exec prettier --write` on `core/web`, which is not formatted yet (`prettier --check` warns on most files).
- L14 still open:
  - Checkbox's `disabled` reads through `disabledOf` (wider than C++, which reads only `disabled`).
- Flake seen once in a full run: Vue `transition.test.ts` and two Angular files failed under load and passed alone and on a second full run.
- L10 still not proven: a real browser run of `examples/web-react` (Metro `.web` pick through the `bootstrap-entry` hop, `event.detail > 0`), and Svelte on a page with a real `document` left patched after mount (the host holds the real one captured at boot).

- it1 note: `opensrc` CLI changed. Use `npx opensrc path <spec> --cwd <root>` (global cache `~/.opensrc`), not the old `--modify=false` form.
