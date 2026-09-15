---
name: symbiote-rn-parity-sweep
description: "Symbiote RN-parity test sweep — read BEFORE continuing, resuming, or auditing further components in the component-by-component audit that ports RN's own test assertions (.vendors/react-native/.../__tests__/*-test.js + *-itest.js) into core/components + per-adapter bridge-smoke tests, proving structural+behavioral parity across all 5 adapters (react/vue/svelte/solid/angular). Started 2026-09-14 via grill-me (scope: core/components state+render + one adapter-bridge smoke per adapter, ALL ~18 core/components, milestone order, Mode B coverage-ledger criterion from test-driven-development). Running ledger + scenarios: .docs/test-cases/rn-parity.test-cases.md (gitignored, not this skill — this skill is the durable method + queue, the ledger is the disposable per-run state). **The original ~18-component queue is CLOSED as of 2026-09-15**: Pressable (pilot), Image+ImageBackground, ScrollView, Switch, TextInput, ActivityIndicator (already fully covered, confirm-only), Button+button-android, TouchableHighlight+TouchableOpacity+TouchableWithoutFeedback, TouchableNativeFeedback(+android), RefreshControl, Modal (first component with zero core tests before this sweep — added state/modal.test.ts + view/render-modal.test.ts from scratch), KeyboardAvoidingView (already fully covered, confirm-only), InputAccessoryView. **View and Text resolved as out-of-scope, not swept, and not a gap**: confirmed 2026-09-15 — neither has a `behaviors/`, `state/`, or dedicated `render-*` file in `core/components` (only the shared `text-props.ts` type, already tested); their real logic (Text-inside-Text → `RCTVirtualText` ancestor resolution, `viewNameFor`/`hasTextAncestor`) lives in `core/engine/src/{node,commit}.ts`, which this sweep's grill-me scope explicitly put outside `core/components` + adapter-bridge. If engine-level RN parity for that logic is ever wanted, it's a separately-scoped effort, not a continuation of this queue. **Verification round 2 ran 2026-09-15** (4 parallel re-verify forks, none trusting round 1's own ledger claims) and found round 1 was NOT complete: 3 real product bugs (TouchableHighlight/Opacity/NativeFeedback missing accessibilityState-disabled press suppression; TextInput engine's `blurTextInput` unguarded; `focus()` not routing through RN's guarded `TextInputState.focusTextInput`) — all fixed. Confirmed (not just speculated) the Angular `[(value)]`/`onValueChange` drop bug also hits `<switch>` — **and FIXED, 2026-09-15**, for both tags, by composing instead of replacing in `renderer/index.ts`'s `listen()` (see the lesson below). **`TouchableHighlight`'s one-node-vs-RN's-two-node divergence — also FIXED, 2026-09-15**, via `onChildInserted` (the same clone-onto-child seam `touchable-native-feedback.ts` already used, no new engine primitive, no framework component) — owner keeps the underlay, the app's own single child gets the cloned opacity, verified against all 5 adapters. **The "no Responder System replicated" claim — ALSO WRONG, and FIXED, 2026-09-15.** The system already existed (`core/engine/src/events/index.ts`, 1443 lines of tests, Pressable already wired into it) — a repo-wide grep just looked in the wrong place. The real, narrow gap (ScrollView never supplied its own should-set/termination-request/grant/release predicates, so `keyboardShouldPersistTaps` had no effect) is closed in `core/components/src/behaviors/scroll-view/responder.ts` — zero `core/engine` changes, zero new components. Design trace: `.docs/architecture/responder-system-design.md`. No open architectural questions remain from this sweep. Every lesson below is CONFIRMED, not hypothetical — most across two independent passes. Trigger on 'continue RN-parity sweep', 're-verify RN parity', 'RN parity next component', 'validate components against RN', 'ported RN tests', 'sweep View/Text', or resuming/auditing this work after a session gap."
---

# Symbiote RN-parity sweep

Component-by-component audit proving `core/components` + all 5 adapters match RN's own
component tests, structurally and behaviorally. Decided via `grill-me` 2026-09-14; execution is
`test-driven-development` Mode B (coverage sweep) per component, run as background `fork` agents
(RN source reading + codegraph dumps are heavy — keep them out of the driving session's context).

## Method (settled, don't re-derive)

1. Layer: `core/components` (state+render) + one adapter-bridge smoke test per adapter, extending
   each adapter's own existing convention (`*-tag.test.*` / `components/*.test.*`) — never a new
   shared cross-adapter contract file.
2. Source of truth: port assertions from `.vendors/react-native/packages/react-native/Libraries/**/__tests__/*-test.js`
   (behavior) and `*-itest.js` (structure, Fabric test renderer) — same expected values, harness
   translated to our reducer/render API. Read the RN implementation only when an assertion isn't
   self-explanatory.
3. Pass criterion: Mode B coverage ledger (symbols/edges/logical-outcomes → covered /
   characterization / N/A+reason) appended to `.docs/test-cases/rn-parity.test-cases.md`.
4. One component (or a tightly-coupled pair, e.g. Image+ImageBackground) per fork. Sequential is
   simplest when there's only one at a time. To run several components in PARALLEL (independent
   source files, fine to fan out): give each fork its own `.docs/test-cases/rn-parity-<slug>.partial.md`
   to write instead of the master ledger, and tell it NOT to touch the master ledger or this skill
   file — both are shared state with no locking, and two forks editing the same file concurrently
   silently overwrite each other's write (last writer wins, not a merge). The coordinator merges
   all partials into the master ledger and deletes them once every fork has returned.

   **"Independent component" is not the same as "independent files" — check for a shared adapter
   file before assuming two components can run in parallel unguarded.** 2026-09-15: a TouchableHighlight
   fix-fork and an unrelated Angular two-way-binding fix-fork were dispatched in parallel without
   partial-file isolation (both were writing real source fixes, not ledger sections, so the earlier
   partial-file trick didn't apply) — both happened to touch `adapters/angular/src/touchable-tag.test.ts`
   (Angular keeps several Touchable variants in one file, same file-layout shape as the Switch
   lesson above). One fork's mid-run test snapshot caught the other's transient edit and had to
   `git stash`-confirm it was unrelated before proceeding. It resolved fine here (Edit's exact-string
   matching means a stale anchor fails loudly rather than silently corrupting), but it was luck, not
   design. Before dispatching parallel fixes (not just parallel ledger-writing verifications), grep
   for whether their likely touch-points share a file, and if so, serialize just that pair.

## What to actually check per component (the lesson this skill exists to record)

Don't assume core is where the gap is — check the bridge first:

- **Per-adapter presence check**: does EVERY one of react/vue/svelte/solid/angular have at least
  one bridge-smoke test for this specific component? Three-for-three so far: no, and always the
  same three adapters (Vue/Svelte/Angular) missing what React/Solid already had.
- **Imperative ref/handle check**: if the component exposes methods through a ref/handle
  (`scrollTo`, `focus`, `clear`, `measure`, …), is that reachable-through-ref surface — not just
  render/props — covered per adapter? ScrollView had render/prop tests everywhere but the
  ref-driven commands tested in only one adapter.
- **Behavioral-assertion check (generalizes the one above)**: a component test file existing, even
  with a plausible-sounding name, isn't proof the actual RN-itest behavioral claim is covered —
  read what it asserts. Button had 2 tests per adapter named around "disabled", but they only
  checked style/accessibilityState; none fired a real touch to prove `disabled` actually suppresses
  `onPress` (RN's `Button-itest.js` makes that its own explicit assertion, twice). Always compare
  the RN reference's assertion LIST against what the adapter test file actually exercises, not its
  test count or titles.

Both checks are cheap (`find adapters -iname "*<component>*test*"`, then read what each file
actually asserts) and have paid off 3/3 times. Do them before assuming a component is "already
covered" just because test files exist.

- **File-layout check, before concluding a component is missing on an adapter at all**: don't
  trust a `find`/`grep` on a per-component path/folder name — an adapter may keep intrinsics in
  one flat file instead (Angular's `elements.ts` holds every directive; Switch showed up as "zero
  files" by path-based search while being fully implemented there). Grep the adapter's actual
  registration/barrel file for the tag name before reporting a "component gap".

- **Angular `[onX]` binding in a test fixture needs `imports: [SYMBIOTE_ELEMENTS]`, not
  `schemas: [CUSTOM_ELEMENTS_SCHEMA]`**: the schema shortcut is fine for a fixture that only binds
  plain data props (value/disabled/style/#templateRef), but the moment a fixture binds a
  callback-shaped `onX` input (`[onValueChange]`, `[onPress]`, …), `CUSTOM_ELEMENTS_SCHEMA` lets
  ngtsc treat it as an unrecognized native DOM event property and Angular's sanitizer throws
  `NG0306` at runtime, not compile time. Always import `SYMBIOTE_ELEMENTS` when the fixture binds
  any `on*` prop.

- **A component with a clone-onto-child fold (TouchableWithoutFeedback: renders no view of its
  own, clones props onto its single child) needs a real child in every fixture, and `nativeID`/
  `testID` go on the OWNER tag, not the child** — the clone recomputes some keys (`nativeID`)
  UNCONDITIONALLY from the owner regardless of what the child already had, and others
  (`testID`, `CLONED_WHEN_SET` list in `touchable-without-feedback.ts`) only when the owner sets
  them; a child-side id was silently dropped in testing (confirmed by dumping the committed tree),
  which is what makes this worth stating rather than assuming symmetry with a normal wrapping
  component.

- **FIXED (2026-09-15): `ValueChangeElement`-based tags used to drop an explicit `onValueChange`-
  shaped handler when `[(value)]` was ALSO bound** — `[(value)]`'s `ngOnInit` listener wrote the
  same `onValueChange` prop key `ngOnChanges` already set from an explicit input, and it ran later,
  so it always won. Confirmed for `<text-input>` and `<switch>` (`SwitchElement` shares the same
  base). Fixed once, in `adapters/angular/src/renderer/index.ts`'s `listen()` for `VALUE_CHANGE_EVENT`:
  it now composes with whatever explicit handler was already on the prop instead of replacing it —
  matches RN, which has no such collision (`onChange` always fires regardless of whether `value` is
  controlled). **The fix needed a second mechanism to avoid a NEW regression**: a MATCHED element
  gets `listen(VALUE_CHANGE_EVENT)` called TWICE for the SAME logical binding (Angular's own
  compiled output-codegen AND the manual bridge both register), and that pair must DEDUPE (last
  wins), not compose — composing them double-delivered every value
  (`lowered-two-way-value.test.ts`'s "delivers a bound handler exactly once" caught this
  immediately). Distinguish the two cases with a `WeakSet` tagging handlers this code path itself
  installed — only an UNTAGGED prior handler (a genuine app-level explicit `[onValueChange]`) gets
  composed. **The rebind ceiling this used to carry is FIXED, 2026-09-15 (second pass)**: closure
  capture at `listen()` install time meant a later `[onValueChange]` rebind (routed through
  `ngOnChanges` → `setProperty`, never through `listen()`) silently killed the `[(value)]` bridge.
  Fixed by reading the explicit handler LIVE from a `WeakMap` on every event instead of capturing
  it — `setProperty` just updates the map, `listen()`'s composed forward function reads it at call
  time, so install/rebind ORDER stops mattering entirely. Don't reach for "rewrap on write" as the
  fix — it reintroduces the exact dedupe regression this lesson already names (the second
  `listen()` call sees the first's composed forward as a "prior bridge", not a genuine explicit
  handler, and drops it) — go straight to the live-read design. See the ledger's "FIXED, 2026-09-15
  (second pass)" section for the full trace. **This is per-element, not per-"two-way-looking" component — check the actual base
  class in `adapters/angular/src/elements.ts`, don't assume from the prop name.** `<refresh-control>` looked
  like a candidate (`refreshing` reads as two-way-shaped) but is `RefreshControlElement extends
  ReadBackElement`, a plain `@Input()` with no `[(value)]` syntax at all — confirmed NOT affected.

- **A component with no render of its own (TouchableNativeFeedback: clones props onto its single
  child, commits no node) needs its bridge-smoke real-touch dispatched ON THE CHILD, not the
  owner** — the press machine lives wherever the pressable behavior actually attaches, and for a
  clone-onto-child component that's the cloned child's own committed instance, not a node for the
  owner tag. Dispatching the touch on the owner in a bridge test silently tests nothing (no
  listener there to fire). Confirmed 2026-09-15, same underlying shape as the
  clone-onto-child/nativeID lesson below but for events instead of props.

- **A keep-alive component (Modal: stays committed briefly after `visible` flips false, for
  `onDismiss` to still arrive) invalidates any `instanceHandle` captured before the toggle** — the
  keep-alive re-render is a clone-on-write, so the node at a visible→hidden transition is a NEW
  committed node, not the same one. A bridge test that grabs `fabric.find(...)` once, toggles
  visibility, then fires a native event on the stale handle is asserting against a detached node.
  Re-query `fabric.find` AFTER the toggle, immediately before firing. Confirmed 2026-09-15 — not a
  product bug, a harness gotcha specific to any component with a keep-alive/deferred-unmount state
  machine (Modal is the only one so far; watch for it if a future component gains one).

- **A prop reaching Fabric correctly via a generic spread/passthrough is NOT the same claim as "this
  specific RN behavior is tested"** — a test asserting the passthrough MECHANISM (e.g. "unknown
  props reach the host") does not prove any one named prop survives it; RN's own test suite names
  each prop individually. Found twice independently in round 2 (Image's `blurRadius`/`capInsets`,
  ScrollView's `pagingEnabled`/`snapToInterval`/`snapToOffsets`/`keyboardShouldPersistTaps`/
  `contentInsetAdjustmentBehavior`/`automaticallyAdjustKeyboardInsets`) — all mechanically worked,
  none were named. Before closing a component as covered, grep for each RN prop name in OUR test
  file, not just in the implementation.

- **Grepping for an RN prop/event name across adapters to check coverage must account for Angular's
  template syntax stripping `on`/brackets** — `onOrientationChange` never appears as that literal
  string in an Angular test; it's bound as `(orientationChange)`. A bare string grep undercounts
  Angular and produces a false-alarm "gap". Check the adapter's actual template/binding, not just
  grep the RN prop name verbatim, before reporting Angular as missing something.

- **A "confirm-only, already fully covered" verdict from a prior pass is exactly where confirmation
  bias hides — re-derive it, don't just re-read the prior conclusion.** Round 2 deliberately
  re-checked ActivityIndicator and KeyboardAvoidingView (both round-1 "nothing to do" verdicts)
  line-by-line against RN source and found genuinely nothing missed — which is only trustworthy
  BECAUSE it was independently re-derived, not because round 1 said so first.

- **Reading only a business-logic module's OWN test file misses bugs in the engine module it calls
  into.** TextInput's `behaviors/text-input.ts` looked complete; the actual bugs (unguarded
  `blurTextInput`, unguarded `focus()`) were one layer down in `core/engine/src/text-input-state.ts`,
  which no round-1 pass had read against RN's `TextInputState.js` at all. When a behavior module
  delegates focus/blur/imperative-handle work to a shared engine module, audit THAT module against
  RN's equivalent too, not just the component-level wrapper.

- **A grep returning zero hits is evidence the SEARCH TERM is absent, not that the MECHANISM is —
  the two get conflated twice in this sweep.** "no Responder System replicated at all" was a
  repo-wide grep for a responder-negotiation concept that missed `core/engine/src/events/index.ts`
  entirely (it exists, ported, tested, wired to Pressable — the grep's search terms just didn't
  match its actual naming). Same shape as the Angular `onOrientationChange` false alarm (grepping a
  literal prop name misses `(orientationChange)` template syntax). Before writing "X is not
  implemented" into the ledger, find the actual place X's *concept* would live (trace a caller, read
  the engine module list, ask what a related feature already needed) rather than trusting one grep's
  silence.

## Resuming after a gap

1. Read `.docs/test-cases/rn-parity.test-cases.md` for what's actually closed (merge, don't trust
   this skill's "done so far" list if the two disagree — the ledger is ground truth, this skill's
   queue is a convenience snapshot).
2. The original ~18-component queue is closed (View/Text resolved as out-of-scope, see
   description — not a pending item). A new component being added to the project is what reopens
   this skill; sweep it the same way.
3. Dispatch one `fork` per component (or several in parallel per the Method section above) with
   the relevant checks from this skill spelled out explicitly in the prompt — don't rely on a fork
   rediscovering these lessons from scratch.
