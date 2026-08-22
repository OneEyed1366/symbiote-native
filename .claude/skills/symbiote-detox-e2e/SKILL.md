---
name: symbiote-detox-e2e
description: "Detox e2e test suites for the four canary example apps (examples/{react,vue-sfc,vue-tsx,angular}/e2e). Read before touching examples/*/e2e/canary-journeys.test.ts, examples/*/e2e/probe.test.ts, or any examples/*/detox.config.js, and before running `npx detox test` / `pnpm exec detox test` to debug a failure. canary-journeys.test.ts is BYTE-IDENTICAL across react/vue-sfc/vue-tsx (the file's own header explains why: Detox attaches below the renderer, so the same journeys prove any adapter) — a fix in one MUST be copied to the other two, never patched in just one. Documents real, fixed flakiness bugs (scroll-momentum drift after bringIntoView, a bare expect racing the JS->recommit round-trip under detoxEnableSynchronization:0, a stale Podfile.lock silently blocking a screen's new native dependency so EVERY test fails identically with no crash log, a probe test gone stale after the app root grew a navigator so every asserted testID vanished at once, Angular's multi-line `{{ }}` interpolation preserving whitespace and breaking exact by.text() matches) and an OPEN, unresolved investigation (Detox's own hittability pre-check reporting `not hittable` for elements that are visually on-screen and tappable via mobile-mcp raw coordinates — confirmed against upstream wix/Detox#3130/#4747/#2229, aggravated by nested FlatLists inside a ScrollView) — read the open-investigation section before re-diagnosing this from scratch. A real, actionable workaround now exists: `device.tap(point)` (screen-absolute, no hittability pre-check) computed from `getAttributes().frame`, plus polling that same `frame` instead of `toBeVisible()` for transform-positioned or ActionButton-composed targets — see "Fix (2026-07): a real, actionable workaround" and the leading hypothesis correlating the bug with Angular's composed-component anchor-host nodes (`ActionButton`/`Pressable` double-wrapping) before writing a new hittability workaround from scratch. Also covers general workflow gotchas: leftover Metro on port 8081 blocking `detox test`, simulator state, and how to manually drive the already-built app outside Detox via mobile-mcp for diagnosis."
---

# Symbiote Detox e2e suites

## Layout

Each example app (`examples/react`, `examples/vue-sfc`, `examples/vue-tsx`,
`examples/angular`) has its own `e2e/` directory: `canary-journeys.test.ts`
(react/vue-sfc/vue-tsx only — **byte-identical across all three**, see below),
`probe.test.ts` (all four — a minimal attach/recommit smoke test), `setup.ts`,
`jest.config.js`, `tsconfig.json`. Detox config lives at
`examples/*/detox.config.js` (iOS sim + Android emu configurations, each
building via `xcodebuild`/`gradlew` or reusing an existing build).

`canary-journeys.test.ts`'s own header comment explains why it's identical
across react/vue-sfc/vue-tsx: **Detox attaches at the stock RN host, BELOW the
renderer SymbioteNative replaces** — so the exact same journey script, with the
exact same `testID`s (contract: `.docs/e2e-cases/feature-vue.e2e-cases.md`),
proves any adapter drives the native surface correctly. **A fix to one copy
must be copied to the other two verbatim** — never patch just one, `diff` all
three after any edit to confirm they still match.

Sync is OFF for the whole file
(`launchArgs: { detoxEnableSynchronization: 0 }`) because the canary runs a
perpetual native `Animated.loop` heartbeat (the native-driver offload proof) — with
sync on, `launchApp` would hang forever waiting for the app to go idle, which
it never does. This is the root cause of both fixed bugs below: with sync
off, NOTHING auto-waits for anything, so every interaction that depends on an
async round-trip must poll or settle explicitly instead of relying on Detox's
usual implicit synchronization.

A Detox failure that smells like real jank rather than harness flakiness (a
settle/scroll-drift delay that keeps growing, a frame that never stabilizes)
is worth cross-checking against `symbiote-perf-measurement`'s on-device
`readCommitProfile()` seam before assuming it's just a synchronization gap.

## Running

```bash
cd examples/react   # or vue-sfc / vue-tsx / angular
npx detox test --configuration ios.sim.debug                          # full suite
npx detox test --configuration ios.sim.debug -t "<title substring>"   # filter by test name
npx detox test --configuration ios.sim.debug --loglevel trace          # full ws protocol log (getAttributes/tap raw responses)
```

- Reuses the existing build at
  `ios/build/Build/Products/Debug-iphonesimulator/Canary.app` if present — no
  rebuild needed for a quick iteration loop. Use `npm run e2e:build:ios` only
  after native/config changes.
- `-t` filters by test TITLE, but still loads/schedules every `e2e/*.test.ts`
  file — non-matching `it()` blocks are shown as `[SKIPPED]`, and a file's
  `beforeAll` only runs if at least one of ITS OWN tests matches the filter.
- Detox auto-passes `-detoxDisableHierarchyDump YES` as a launch arg whenever
  `detoxEnableSynchronization: 0` is set — the usual "view hierarchy dump on
  failure" (mentioned in Detox's own error HINT text) is **not available** in
  this project's canary tests. Use the `mobile-mcp` workaround below instead.

### Gotcha: leftover Metro on port 8081

Every example's Metro dev server binds `:8081`. A leftover `react-native
start` process from an earlier manual/visual-verification session (e.g. via
the `run` skill to eyeball something on a simulator) makes `detox test` fail
immediately with `EADDRINUSE` — the whole run exits before jest even starts,
with no test output at all. Always check first:

```bash
lsof -nP -iTCP:8081 -sTCP:LISTEN
kill <pid>   # if a stale process owns it
```

### Manually driving the built app outside Detox (for diagnosis)

When Detox's own error is ambiguous or you suspect Detox itself (not the
app) is wrong, drive the already-built app directly via `mobile-mcp`,
bypassing Detox's synchronization/hittability layer entirely:

```bash
cd examples/react && npx react-native start   # Metro must be running; port 8081 must be free first
```
Then: `mobile-mcp`'s `mobile_launch_app` (packageName
`org.reactjs.native.example.Canary`, device UDID is whatever
`mobile_list_available_devices` reports — this session used iPhone 17,
`F1A51728-ED67-4995-B703-590EB3D597A3`) + `mobile_take_screenshot` /
`mobile_click_on_screen_at_coordinates` / `mobile_list_elements_on_screen`.
**Kill the manual Metro before letting `detox test` run again** (port
conflict, same as above). Note `mobile_list_elements_on_screen` is
accessibility-tree based and will NOT show a plain `View` with no
accessibility traits — it only surfaced the child `Text`, not the parent
`View`, for the counter-card investigation below; it's useful for reading
on-screen text/labels, not for a full raw-UIKit-view dump.

## Fixed: two real flakiness bugs (2026-07)

Both live in `bringIntoView`/the counter-card test, patched identically in
`examples/{react,vue-sfc,vue-tsx}/e2e/canary-journeys.test.ts`.

```
§1a_scroll_momentum_drift := {
  bug: "tap right after bringIntoView's .scroll(300,'down',NaN,0.8) lands on a spot the target already drifted from — ScrollView momentum continues after scroll() resolves (a real swipe gesture, not a discrete scrollTo)",
  symptom: "Detox 'View is not hittable'/'not visible', frame partially clipped by the scroll container",
  fix: "bringIntoView made async, await sleep(300) after the scroll call",
}
```
```ts
async function bringIntoView(id: string): Promise<void> {
  await waitFor(element(by.id(id)))
    .toBeVisible()
    .whileElement(by.id('canary-scroll'))
    .scroll(300, 'down', NaN, 0.8)
  await sleep(300)
}
```
```
§1b_bare_expect_races_recommit := {
  bug: "sync off ⟶ await element(...).tap(); await expect(...).toHaveText(...) immediately races onPress→setState→Fabric recommit, fails intermittently by round-trip speed",
  fix: "use the file's pre-existing waitForText(id, matches, timeoutMs) helper (already used for Image.getSize/measure() readouts) instead of a bare synchronous expect",
}
```
```ts
await element(by.id('counter-card')).tap()
await waitForText('counter-value', text => text === 'tapped 1×', 3_000)
```

## OPEN INVESTIGATION: counter-card second-tap "not hittable" (unresolved)

**Status as of 2026-07: NOT fixed at write time — later resolved by the
`device.tap()` workaround, §6 below. Read this before re-diagnosing from
scratch.**

```
§2_counter_card_second_tap_not_hittable := {
  bug: "counter-card test deterministically fails on the SECOND tap (0×→1× always ok, 1×→2× always fails), identical error every run regardless of wait (300ms/3s/20s/30s all tested ⟶ not a transient race)",
  error: "'View is not hittable at its visible point. View is not visible around point.' view point {177, 32.33}; visible bounds {{0,0},{354,64.67}}; view bounds {{24,557},{354,64.67}}; 'View does not pass visibility percent threshold (100)'",
  native_side: "dtx_assertHittableAtPoint, UIView+DetoxUtils.m:579 (DetoxFailureInformation)",
  proof_not_app_bug: "mobile-mcp mobile_click_on_screen_at_coordinates on counter-card's real screen center (201, 651 on iPhone 17 sim, 402×874pt), twice with no delay, bypassing Detox tap()/hittability entirely — both taps worked instantly (0×→1×→2×, screenshotted after each) ⟶ SymbioteNative/React onPress/Fabric recommit has no bug; failure is 100% inside Detox's own native pre-check",
  evidence: [
    "screenshot right before the failing tap: card fully visible, reads 'tapped 1×', nothing visually wrong",
    "getAttributes() before the failing tap: visible:true, hittable:false, AND two DIFFERENT y-offsets for the same element — elementFrame.y=557 vs frame.y=619 (~62pt gap, unexplained)",
    "child Text (counter-value) reports hittable:true independently — only parent View (counter-card) reports hittable:false",
    "tapWithRetry(id, attempts) (300ms-backoff wrapper) does NOT help ⟶ deterministic, not a transient race",
  ],
  hypotheses_unproven: [
    "Detox hittability check uses wrong coordinate space (elementFrame vs frame ~62pt mismatch) for this RCTViewComponentView after a recommit",
    "Detox's accessibility-identifier element cache resolves a stale/differently-attached native view from Fabric clone-on-write mounting (<clone_on_write_lives_in_engine>, root CLAUDE.md) — check RCTViewComponentView reuse vs recreation across a props-only recommit",
  ],
  next_steps: [
    "check for a Detox tap variant skipping its hittability assertion — was mid-checking detox/index.d.ts / detox/detox.d.ts in node_modules/.pnpm/detox@* when paused",
    "if none exists: mobile-mcp-style raw coordinate tap as documented escape hatch, wait for upstream fix, or avoid tapping the SAME element twice in immediate succession",
    "re-run the other original full-suite failures (modal, responder chip, switch, animations, persist, image getSize, measure, chips FlatList, sticky SectionList) once fixed — likely cascading scroll-drift/state-carryover from test 1, not independent bugs",
  ],
}
```

## Fixed (2026-07): stale Podfile.lock silently breaks EVERY test when a screen gains a new native dependency

```
§3_stale_podfile_lock := {
  bug: "probe.test.ts/canary-journeys.test.ts fail on the VERY FIRST assertion (e.g. angular-root/resp-chip-0 never appears), no crash, no red box, nothing in `xcrun simctl spawn <udid> log show --predicate 'process == \"Canary\"'`",
  root_cause: "a screen started rendering a component backed by a NEW native dependency (e.g. App.ts wrapping the app in @symbiote-native/navigation's <Stack>, mounting react-native-screens' RNSScreen/RNSScreenStack) without a matching pod install ⟶ ios/Podfile.lock predates the dep (check mtime / grep RNScreens ios/Podfile.lock), built .app has no matching symbols (`strings <binary> | grep -c RNSScreen` → 0), new native view fails to construct, ENTIRE tree under it never mounts",
  symptom: "every test in the file times out identically — Detox is fine, app never rendered anything",
  fix: "cd ios && pod install, then a real rebuild (pnpm run e2e:build:ios, not just pnpm ng:build) — genuine native change, no shortcut",
}
```

## Fixed (2026-07): probe.test.ts went stale after App.ts became Menu-first

```
§4a_probe_stale_after_menu_first := {
  bug: "App.ts restructured to wrap the demo surface in @symbiote-native/navigation's <Stack> with Menu as initialRouteName (Canary demoted to a pushed screen via menu-row-Canary testID); probe.test.ts never updated — still asserted angular-root on launch, a testID that no longer existed",
  also_renamed: "angular-counter → angular-counter-card/angular-counter-value, angular-switch → angular-spinner-switch, angular-spinner → angular-spinner-indicator, angular-input → angular-greeting-input (later CanaryScreen rework)",
  lesson: "a probe/smoke test asserting a testID directly on launch hard-depends on the app's ROOT component shape — inserting a navigator above it makes EVERY assertion time out identically with no 'Failed to find' error, indistinguishable from infra breakage (wrong binary, stale build). Check tested testIDs still exist (`grep -rn testID screens/CanaryScreen.ts`) before assuming the harness is broken",
  fix: "added a beforeAll-independent first test navigating menu-row-Canary → angular-safe-area, updated every renamed testID",
}

§4b_angular_multiline_interpolation_whitespace := {
  bug: "<Text>a text\\n  {{ expr }}\\n</Text> (multi-line, indented) renders with literal leading/trailing whitespace/newlines intact — Angular's preserveWhitespaces:false does NOT collapse this the way JSX auto-trims text children",
  confirmed_via: "mobile-mcp mobile_list_elements_on_screen — angular-image-bg-label's a11y label came back as ' Angular children paint on top of the image ' (leading+trailing space) for a 3-line template",
  symptom: "any Detox by.text('exact string') assertion against such a node fails a deterministic silent timeout, no error explains why",
  fix_options: [
    "assert via the node's own testID instead of by.text (robust either way)",
    "short copy: write the interpolation inline on one line (<Text testID=\"x\">tapped {{ count }}×</Text>) so no incidental whitespace exists",
  ],
}
```

## OPEN INVESTIGATION UPDATE (2026-07): confirmed upstream — wix/Detox #3130, #4747, #2229

```
§5_confirmed_upstream_hittability_bug := {
  second_case: "Angular's probe.test.ts angular-open-modal — reachable/tappable via raw mobile-mcp coordinate taps, confirmed on-screen — deterministically fails Detox's .tap() with 'View does not pass visibility percent threshold (100)' every run, unaffected by settle delays, keyboard-dismiss taps, or scroll strategy (whileElement().scroll(), manual step-scroll, scrollTo('bottom') all reproduce)",
  coordinate_mismatch: "getAttributes(): elementFrame {y:5862.6665,x:24,w:354,h:45} (position inside scroll CONTENT) vs frame {y:587.9998,x:24,w:354,h:45} (real ON-SCREEN position, well inside 874pt viewport); hittable:false, visible:true — much larger than counter-card's 62pt gap",
  upstream_refs: [
    "wix/Detox#3130 — 'Detox 19.3.0 causes View is not hittable failures'; maintainer confirms a DELIBERATELY stricter hittability assertion landed in 19.3.0, breaking previously-stable tests by design",
    "wix/Detox#4747 — same error; that case resolved when a full-screen transparent overlay intercepted the hit-test ahead of the real target. CanaryScreen has an analogous angular-overlay-host portal-target sibling of the ScrollView, doesn't fully explain THIS failure since sibling taps on the same screen succeed",
    "wix/Detox#2229",
  ],
  aggravating_factor: "Detox 'may match the wrong ScrollView' when ScrollViews nest — CanaryScreen nests TWO FlatLists (angular-chips-list, angular-mvcp-list) directly inside its outer ScrollView, the RN-warned-against anti-pattern; plausible factor for deep elements hitting the bug while shallower ones (angular-counter-card, switches, text inputs) don't",
  resolution: "it.skip('opens and closes an Angular Modal through Fabric', …) in probe.test.ts, comment citing this section — not a fix, a documented upstream-confirmed limitation",
  reenable_if: "wix/Detox ships a fix for #3130/#4747/#2229, OR CanaryScreen's two FlatLists are pulled out of the outer ScrollView (also worth retesting counter-card bug then — same theory could explain both)",
}
```

## Fix (2026-07): a real, actionable workaround for the hittability bug — `device.tap(point)`

```
§6_device_tap_workaround := {
  api: "device.tap(point)/device.longPress(point) — screen-absolute coords, present in installed detox@20.51.4 types — a RAW simulator-level tap with NO element-matcher hittability pre-check, unlike element(...).tap() which always runs dtx_assertHittableAtPoint/the visibility-percent check first",
  combined_with: "getAttributes().frame ('in screen coordinate space', confirmed accurate even for the buggy elements) ⟶ sidesteps the whole hittability-bug class instead of chasing settle delays against a geometry pre-check that structurally never passes",
  caveat_stale_frame: "a frame read right after a scroll can be stale (momentum drifts a beat after resolve — same reason bringIntoView sleeps 300ms). Harden by re-reading frame until two consecutive reads agree (see canary-native-modules.test.ts's deviceTap), not a single blind read. A stale/mid-drift tap can land on a NEIGHBORING control and trigger the wrong app-wide state change — observed once: a drifted tap meant for angular-status-bar-style-btn plausibly hit angular-status-bar-hidden-btn instead, toggling hidden state, shifting safe-area layout, cascading into several unrelated tests failing to find angular-canary-scroll",
  also_breaks: "the same toBeVisible() geometry check also breaks plain waitFor(...).toBeVisible() on the same element class, timing out regardless of duration (tested to 20s) ⟶ proof it's the check failing, not a slow transition; fix is polling raw frame instead of trusting the boolean (waitForFrameSettle below)",
  transform_positioned_views: "a view positioned via animated transform (e.g. packages/navigation/src/angular/drawer/index.ts's panelStyle/contentStyle, Animated.timing with useNativeDriver:false) has an additional documented reason toBeVisible() can never succeed: iOS specifies UIView.frame as UNDEFINED once transform isn't identity. getAttributes().frame still reports real numbers (Detox computes via proper screen-coordinate conversion, not the raw .frame getter) ⟶ waitForFrameSettle/deviceTap work fine here too; direction doesn't matter, the same settle-poll covers opening and closing",
}
```
```ts
async function deviceTap(id: string): Promise<void> {
  const attrs = await element(by.id(id)).getAttributes();
  if (!('frame' in attrs)) throw new Error(`${id}: getAttributes() returned no frame`);
  const { x, y, width, height } = attrs.frame;
  await device.tap({ x: x + width / 2, y: y + height / 2 });
}

async function waitForFrameSettle(id: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: { x: number; y: number } | undefined;
  let stableReads = 0;
  while (Date.now() < deadline) {
    const attrs = await element(by.id(id)).getAttributes();
    if ('frame' in attrs) {
      const { x, y } = attrs.frame;
      if (last && Math.abs(x - last.x) < 1 && Math.abs(y - last.y) < 1) {
        stableReads += 1;
        if (stableReads >= 2) return;
      } else {
        stableReads = 0;
      }
      last = { x, y };
    }
    await sleep(150);
  }
  throw new Error(`${id}'s frame never settled within ${timeoutMs}ms`);
}
```

### A concrete, previously-undocumented correlation: which testIDs hit this bug

```
§7_testid_correlation_anchor_host := {
  reliably_hit: "every element reached through an ActionButton (wraps <Pressable>) — deep-link-resolve, persist-serialize, persist-restore, drawer-close-from-settings, sheet-dismiss, angular-alert-btn/angular-action-sheet-btn/angular-vibrate-btn/angular-status-bar-style-btn",
  never_hit: "menu-row-* (bare <Pressable> in MenuScreen.ts), TabsDemo's tab bar items (packages/navigation/src/core/render-tabs.ts's renderTabBar — framework-agnostic, plain symbiote-view with passthrough onPress, no Angular wrapper), non-Pressable primitives (Switch, TextInput, ScrollView)",
  leading_hypothesis_traced_not_proven: "a composed Angular component (Pressable + wrappers) renders as a non-painting ANCHOR HOST node in ADDITION to its real content node (adapters/angular/src/primitives/shared.ts's anchorHostStyle — see angular-adapter-renderer.md's ANCHOR_HOST_COMPONENTS rule). ActionButton itself wraps <Pressable> (also composed) ⟶ a testID reached through ActionButton sits behind TWO stacked anchor nodes vs one for bare <Pressable>, zero for plain symbiote-view — lines up exactly with which testIDs fail",
  supporting_doc: "Detox docs independently describe this failure shape: 'if an element with pointerEvents=\"none\" is obscuring your target element... consider restructuring your component hierarchy... making the obscuring element a descendant of the target element' — an anchor node above the real content at the same screen position is a strong match",
  not_yet_confirmed: "via Xcode view-hierarchy debugging (wix.github.io/Detox/docs/guide/debugging-in-xcode) or a real-device repro with the anchor node isolated — leading hypothesis, not closed",
  if_confirmed: "real fix likely in the anchor-host mechanism itself (e.g. anchor pointerEvents=\"none\" explicitly, or excluding it from Detox's accessibility tree) ⟶ would obsolete deviceTap/waitForFrameSettle for EVERY composed-component testID project-wide, not just this suite",
}
```

## Simulator used this session

iPhone 17, UDID `F1A51728-ED67-4995-B703-590EB3D597A3`, iOS 26.5, screen
402×874pt / 1206×2622px @3x. Angular canary tests used a second simulator,
`iPhone 17-Detox`, UDID `88104F11-E404-4528-940C-903A4EA5F9B3`.
</content>
