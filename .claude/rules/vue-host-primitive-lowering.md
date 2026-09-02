---
paths:
  - 'adapters/vue/metro-vue-transformer.cjs'
  - 'adapters/vue/babel-jsx.cjs'
  - 'adapters/vue/babel-lower-host-primitives.cjs'
  - 'adapters/vue/src/renderer/index.ts'
  - 'adapters/vue/src/components.ts'
---

# `<View>`/`<Text>` in an SFC compile to an ELEMENT — three things depend on that

The transformer lowers those two tags to `symbiote-view` / `symbiote-text` so Vue skips a
component instance each (measured 12-14% of Vue's create; Vue charges one even for a FUNCTIONAL
component). Consequences a change here must not break:

- **Both halves or nothing.** Renaming `node.tag` is not enough — also set `node.tagType = 0`,
  and make `isCustomElement` answer true for the original tag AND the intrinsic. Half-done codegen
  emits a component whose children are `withCtx` slots the element path never mounts: a silently
  EMPTY subtree, nothing red.
- **Only tags this file imported from `@symbiote-native/vue`.** Matching bare tag names rewrites
  an app's own `<View>`.
- **The wrappers in `components.ts` stay.** Lowering is SFC-only; TSX and `h()` still use them.
- **The renderer now owns what the wrapper folded**: kebab→camel per key in `patchProp`, and RN's
  Text defaults (`seedTextDefaults` + the explicit-`undefined` re-seed). Both failures are
  device-only and silent.

Full mechanism, measurements, and the `@vue/compiler-sfc` facts behind it: the
`symbiote-sfc-style-compiler` skill, §host-primitive lowering. Why the cost exists at all:
`symbiote-perf-measurement`, §vue_the_cost_is_vues_own_component_instance.

## TSX/JSX gets the same lowering through a different vehicle

`babel-lower-host-primitives.cjs` rewrites the tags for the JSX path; `metro-vue-transformer.cjs`
does it for SFC templates. Same rule set, and the "both halves or nothing" invariant is sharper
here because the second half is a plugin OPTION rather than a line in the same function:

- **`@vue/babel-plugin-jsx` must be given `isCustomElement` answering true for `symbiote-*`.**
  Without it a lowered tag compiles to `createVNode(resolveComponent("symbiote-view"), …,
{default: () => [...]})` — a component that resolves to nothing, carrying SLOT children an
  element path never mounts. Blank subtree, no error. `babel-jsx.cjs` exists to hand the plugin and
  the option out as one `require()` so they cannot be wired apart; both failure shapes are pinned
  in `babel-jsx.test.ts`.
- **Plugins, not a preset.** `@vue/babel-plugin-jsx` has to run before the RN preset's React-JSX
  transform claims the same nodes, and Babel applies `plugins` before `presets` — moving it into a
  preset silently reorders it after every plugin.
- **The TSX plugin refuses nothing beyond the import/shadow check**, unlike the Solid twin, and
  that is deliberate: Vue's View/Text only ever folded kebab->camel and RN's Text defaults, and both
  already live in the renderer. Adding a refusal would make TSX diverge from SFC, which lowers
  unconditionally.
- Verified over `examples/vue-tsx`: 593 lowered vnodes across 17 files, 0 View/Text left as
  components, 0 `resolveComponent("symbiote-*")`, 0 slot-shaped children on an intrinsic.

## Which OTHER components qualify — the audit, so nobody re-derives it

Lowering is not a track the whole component set moves onto. A component qualifies iff all three
hold: **(1)** it renders a statically-known host shape, **(2)** it holds no per-instance state —
no `ref`/`watch`/timer/imperative handle, and **(3)** its prop transform is a pure function of
props, so it can run somewhere other than a component body (compile time, or engine-side keyed on
the tag). Audited across `adapters/vue/src/components/` 2026-08-23:

```
                      host shape                 state              verdict
View / Text           1 tag                      —                  LOWERED
Image                 1 symbiote-image           —                  qualifies: renderImage is a pure
                        (render-image/index:263)                      fold; move it, then lower
SafeAreaView          1 symbiote-safe-area-view  —                  qualifies: only resolveAccessibilityProps
InputAccessoryView    1 tag (renderInputAcc…)    —                  qualifies
RefreshControl        1 tag + onRefresh closure  —                  borderline: the closure needs a home
ActivityIndicator     2 (view > spinner)         —                  possible, NOT 1:1 — transform must
ImageBackground       2 + slot                   —                    emit the wrapper too
Pressable             1 tag                      pressed ref, timers, measure ref
Switch                                           ref + watch + setValue command
ScrollView                                       2 ref + watch + imperative handle
TextInput / Modal / KeyboardAvoidingView / VirtualizedList   4 / 1 / 7 / 5 reactive
Touchable*                                       wrap Pressable + own animation
FlatList / SectionList / VirtualizedSectionList / Button     no host node of their own — lowering
                                                               is meaningless, they are logic containers
```

**Image** and **SafeAreaView** are the cheap ones (both blocked on moving a pure fold out of the
component body), and everything below the line is a different problem, not a deferred one. But
read the payoff honestly before starting either: **neither appears in the benchmark row**, which
is `View + 3 Text + 2 Pressable`. Lowering them moves the benchmark by exactly zero and pays only
in an app that uses them. The measured queue and the cheap queue are not the same queue.

**Pressable is the interesting boundary and is worth reading before anyone calls it impossible.**
Its state is genuinely per-instance, so no tag substitution works as-is — but `pressed` is only
ever OBSERVED through `v-slot="{ pressed }"` or the function form of `style`, and an SFC compiler
can see both. With neither present, `pressed` is written and never read, and the machine itself
(`createPressHandlers` / `createPressRuntime`, already framework-agnostic in
`@symbiote-native/components`) has a per-node home available: the engine node. "Press machine as
an engine-side behavior on a `symbiote-pressable` tag" is architecturally consistent with
`<adapters_stay_thin>` and would pay in every adapter. UNBUILT and UNMEASURED — 2 of the 6
primitives in a benchmark row are Pressable, and headless puts the trio
`pressable + createReactiveObject + track` at ~13 of 128 ms.

## A functional `style` lowers by being CALLED — and the pair reads the expression TWICE

`style={fn}` no longer refuses. It expands to `style` + `activeStyle`, each the callback applied to
one state, and the engine swaps slot 1 while the node is pressed (`routeProp`'s `activeStyle`
branch). Two mechanisms, and **only one of them decides the verdict**:

```
CALL           covers every shape, spelled identically in every transform   -> decides what lowers
substitution   specializeStateStyle, only where an AST is already in hand   -> optimisation only
```

Vue's JSX path applies both; the SFC path has no JS AST (the compiler hands it source TEXT) and
emits only calls. That is a difference in cost, deliberately not in verdict — pinned by
`adapters/vue/lowering-parity.test.ts`, which runs one fixture table through BOTH transforms and
asserts they agree before it asserts either is right. Two identically-broken transforms satisfy
agreement alone, which is why the table is checked as well.

**Every style shape lowers. What differs is the EMIT, and picking the wrong one per shape is where
the cost or the bug lives.** The pair needs the expression twice, and only the emit decides whether
that means reading it twice:

```
({pressed}) => ({…})   literal     (E)({pressed:false})                 two closures, no read hazard
styleFn · props.style  reference   typeof E==='function' ? E({…}) : E   E printed twice — a read
getStyle() · bag[i]    opaque      ...resolveStateStyle(E)              E printed ONCE — required
flag ? a : b           opaque      same                                 two reads could differ
```

This was FIRST written as three refusals, and that was wrong — recorded because the error is easy to
repeat. Reading twice is a property of the inline guard, not of the expression, so a refusal would
have encoded one emit's defect as a rule and cost real coverage. The requirement is on the OUTPUT:
`REFUSAL_CATEGORIES.emitStyleExpressionOnce`, asserted in `lowering-parity.test.ts` by counting
occurrences in the emitted text, because a verdict assertion alone ratifies either emit.

**The helper is not the default, and that is a measurement.** It returns one object, so Vue must
spread it — and a spread costs the element its patch flag: measured through the real `compileSfc`,
`12 /* STYLE, PROPS */` becomes `16 /* FULL_PROPS */` plus a `mergeProps` on every render, on the
hottest element in the tree. A literal and a name cannot change meaning when re-read, so they keep
the cheap inline form; only an opaque expression pays. Verdict parity with the other adapters is
unaffected — cost is allowed to differ, verdicts are not.

The contract on app code, worth stating in review: **the callback must be pure in the state.** It is
executed twice.

**`ref` refuses on both paths — the behaviour is settled, the JUSTIFICATION is not.** `ref` on a
component yields the component instance and on an element the host node, so lowering changes which
object the app receives. Refusing is the safe side and costs nothing measured (no `ref` sits on a
`Pressable` in either example), so it stands. What is NOT established is which surface is richer:
`Pressable` never calls `defineExpose`, while `SymbioteNode` carries `measure` / `measureInWindow` /
`setNativeProps` / `focus` as prototype methods — which points at lowering IMPROVING the ref rather
than breaking it.

An attempt to measure it failed and the failure is the part worth keeping: mounting through the
adapter's own `mount()` left the ref `null` after `nextTick` for a component, for a lowered tag, AND
for a plain `symbiote-view`. Template refs do not resolve in that harness at all, so the first
assertion — "the component exposes nothing" — passed on `null` rather than on an empty instance. A
tautology that confirms whatever it was pointed at. Anyone re-opening this needs a harness where a
`symbiote-view` ref is demonstrably non-null BEFORE reading anything into the comparison.

Two mechanical notes that survive regardless: the two SFC spellings are different node types —
`ref="x"` is a plain ATTRIBUTE and `:ref="x"` a directive — so a check placed after the directive
filter catches only half. And `View`/`Text` lower unconditionally, so whatever the answer is, it
applies to them too and is untouched.

**SFC needs no Babel dependency, and reaching for one is the trap.** `@babel/{parser,types,
generator}` do not resolve from `adapters/vue` under pnpm isolation, and adding them to a PUBLISHED
adapter also forces every example through a full reinstall (the overlay's folder swap cannot install
a new dependency). Neither is necessary: nothing is printed — the emitted text WRAPS the original
expression text — and `@vue/compiler-sfc` re-exports `babelParse`, so the shape is classified off a
real Babel AST on both paths.

**Read the expression text from the compound's `children`, never `exp.loc.source`.** `loc.source` is
what the author wrote; `transformExpression` has already rewritten every setup binding by the time a
nodeTransform runs, and only the children carry the final text.

Consequence for app code: **`.action-button:active` is now an optimisation, not an entry
condition.** A hoisted `:style="actionButtonStyle"` lowers on its own. The CSS rule is still cheaper
than two calls per render, so migrated call sites stay migrated — but the tool no longer demands the
rewrite, which was the whole objection to demanding it.
