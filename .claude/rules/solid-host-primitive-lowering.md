---
paths:
  - 'adapters/solid/babel-lower-host-primitives.cjs'
  - 'adapters/solid/babel-preset.cjs'
  - 'adapters/solid/src/renderer.ts'
  - 'adapters/solid/src/components/view.tsx'
  - 'adapters/solid/src/components/text.tsx'
---

# `<View>`/`<Text>` compile to an ELEMENT in Solid — and the REFUSALS are the load-bearing half

`babel-lower-host-primitives.cjs` rewrites those two tags to `symbiote-view` / `symbiote-text`
before `babel-preset-solid` sees them, so they compile to `createElement` + `setProp` instead of
`createComponent` + a props Proxy. Measured: proxy traps (`keys`/`get`/`getOwnPropertyDescriptor`)
were 16.2% of a whole 4 000-row create and `splitProps` another 6.1%; the A/B, with both arms
really compiled and `createNode` asserted equal at 36 002, read -24.3% min / -30.0% median.

What a change here must not break:

- **Plugins run before presets.** The lowering is a `plugins:` entry in `babel-preset.cjs`, not a
  preset. Reversed, `babel-preset-solid` has already turned the JSX into `createComponent` and
  there is nothing left to rewrite.
- **Only tags this file imported from `@symbiote-native/solid`, and only an unshadowed one.** A
  bare name match rewrites an app's own `<View>`; the binding kind is checked at the use site.
- **Lower ONLY when the whole attribute set is visible.** The wrappers do real work besides
  forwarding — `resolveAccessibilityProps` folds `aria-*`/`role` into the COMPOSITE
  `accessibilityState` / `accessibilityValue`, which needs the whole bag, and a lowered element has
  no bag. So an element carrying `aria-*`, `role`, or a `{...spread}` whose keys cannot be read is
  left a component. Removing a refusal without adding the corresponding compile-time fold breaks
  accessibility silently, on device only.
- **`id` -> `nativeID` is different** — a pure per-key rename with no bag, done in the plugin. It
  duplicates what `routeProp` should eventually own; collapse it there as its own change with its
  own test, not as three lines riding along in another commit.
- **The renderer now owns RN's Text defaults** (`seedTextDefaults` at `createElement`,
  `textDefaultFor` in `setProperty`). Seeding at create ALONE is not enough: a framework clearing a
  prop it set earlier sends an explicit `undefined` at patch time and the default has to come back.
  Vue's twin is `adapters/vue/src/renderer/index.ts`.

Full mechanism and numbers: `symbiote-perf-measurement`. The Vue twin of this rule, whose vehicle
is the SFC transformer rather than Babel: `.claude/rules/vue-host-primitive-lowering.md`.

## Getting it into a device build — two steps that fail silently if skipped

1. **`babel-lower-host-primitives.cjs` must be in `package.json` `files`.** `babel-preset.cjs`
   reaches it by relative `require()`, which no `exports` entry, no test, and no `pnpm pack`
   warning covers. Omitted on 2026-08-23; the tarball shipped a preset requiring a file that was
   not in it. Now guarded by `tests/package-files-cover-cjs-requires.test.ts`.
2. **Metro must be started with `--reset-cache`.** The app's `babel.config.js` does not change when
   the plugin does, and Metro's transform cache key does not hash the contents of a plugin inside
   `node_modules` — so a rebuilt app keeps serving the pre-lowering transform. Same trap the Svelte
   preprocessor hit (`svelte-adapter-dom-shim` §32).

Verify before spending a build, by compiling the app's own source through its own config:

```
cd examples/solid && node -e 'const b=require("@babel/core"),fs=require("fs");
const o=b.transformSync(fs.readFileSync("screens/BenchmarkScreen.tsx","utf8"),
  {filename:require("path").resolve("screens/BenchmarkScreen.tsx"),cwd:process.cwd(),root:process.cwd()}).code;
console.log((o.match(/symbiote-view/g)||[]).length,(o.match(/createComponent\(View/g)||[]).length)'
```

Second number must be 0. Across all 52 `.tsx` of `examples/solid`: 271 view + 370 text lowered,
zero refusals.

## What lowering UNMASKS: an unchanged `class` still dirties the node

Measured on device 2026-08-23, the one row that got worse: `Select` went WRITES 2 -> **1001**,
VISITED 1044 -> 4043, reconcile window 1.5 -> 10.3 ms — with Fabric unchanged at 0/0/10 and 4 prop
keys, so nothing reached the native side.

`routeProp`'s `class` branch ends in `pushClassStyle`, which publishes a **fresh
`[classStyle, explicitStyle]` array** every time; `setProp`'s guard is `Object.is` and can never
fire on a fresh array. The re-push is deliberate — it is the restore path after `setNativeProps`
overwrites the declarative style, and `pushClassStyle`'s own comment forbids "finishing the
optimization" naively.

It costs React/Vue/Svelte nothing because each diffs props before calling the engine. **Solid has
no diff**: a fine-grained effect re-runs whenever any signal it reads changes, so every row
re-pushes its class when a list-wide signal moves. Before lowering, the `View` component's
`splitProps`/`mergeProps` memos swallowed it — the component wrapper was acting as a memoization
barrier, and the lowering removed it along with the cost it was there to justify.

So: **do not read a WRITES jump after lowering as a lowering bug.** Check whether Fabric moved
first; if it did not, the framework was previously being diffed by a wrapper, not by itself.

FIXED 2026-08-23 in the engine, not the adapter (`<clone_on_write_lives_in_engine>`):
`isAlreadyPublished` in `core/engine/src/node.ts` gives `pushClassStyle` an early return when the
array it is about to publish would be identical to the one already standing. It reads that array
back out of `node.props.style` rather than remembering it in a field — the array IS the record, so
there is nothing to keep in sync and no shape change to the node.

The array check is what separates it from the naive skip `pushClassStyle`'s own comment forbids.
`setNativeProps` writes `node.props.style` as a flattened OBJECT, never an array, so after any
bypass `Array.isArray` is false, the re-push happens as before, and the restore path is untouched.
Guarded by `core/engine/src/__tests__/class-style-republish.test.ts`, which asserts BOTH halves —
`writes` (the write was turned away) and `nodesVisited` on a following commit (the node was not
MARKED). The second is what would catch an over-eager guard, since one that swallowed a real change
would leave `writes` looking right while the screen silently kept the old value. Removing the guard
fails both independently.

Two things that test needs and a reader would otherwise strip: the mounted node must have a CHILD
(a node hanging directly off the container is visited whether dirty or not, so at depth 1
`nodesVisited` can never show a difference), and each case commits once to settle before measuring.

**What the guard does and does not fire for — corrected 2026-08-23 after the first version of this
paragraph was wrong.** `resolveClassName` memoizes only the STRING branch, and the guard compares
slot 0 with `Object.is`, so anything resolving fresh can never be turned away. The question is which
of those an adapter can actually produce.

This paragraph first claimed an app writing `:class="{ row: true }"` gets no `isAlreadyPublished`,
called it a live bug in every adapter, and proposed canonicalising object/array classes into token
strings. **All three were wrong, and the proposal would have broken working code.**

- **An object never reaches the engine as a class map.** Vue normalises it in `createVNode` before
  `patchProp` sees it (`@vue/runtime-core/dist/runtime-core.esm-bundler.js:7808`,
  `if (klass && !isString(klass)) props.class = normalizeClass(klass)`), so `:class="{btn:true}"`
  arrives as `"btn"`. Angular's Ivy compiles every class form to per-token `addClass`/`removeClass`
  and the renderer joins them into one string before `routeProp`. React's `className` is a string.
- **The object member of `IClassNameValue` is `IResolvedStyle`** (style-registry) — a STYLE handed
  through the class prop, which is how ScrollView / VirtualizedList / FlatList / ImageBackground
  pass one. Canonicalising it into tokens would have destroyed that channel. Refusing there is
  correct behaviour, not a gap.
- **The all-string ARRAY was the one real case**, and it is closed: `canonicalClassName` joins it
  into a single string from `routeProp` and from `resolveClassName`'s array branch, so the memo, the
  pressed variant and the guard all apply. A MIXED array is deliberately left alone.

A falsy class still returns a fresh `{}` and so is never guarded; a shared frozen constant would
close it and it genuinely is not a hot path.

The lesson underneath, which cost three corrections in one afternoon: **read the side of the usage
that DECIDES, not the declaration plus one convenient side.** The type said an object was possible,
so "an object reaches the engine" felt checked. What decided it was the producer, two minutes away
in `createVNode`, and nobody opened it until someone was about to build on the claim.

## Lowering Pressable: the refusal list, measured rather than reasoned

Measured by AST over the 19 `<Pressable>` sites in `examples/solid`, 2026-08-23. Every number here
came from parsing, not from reading the components:

```
lowerable                        12
refused: functional `style`       3
refused: render-prop child        2
refused: spread / role / aria     0
refused: android_ripple           0   (no example sets it — both mentions are comments saying so)
```

**A function child refuses only at arity >= 1.** A zero-arg arrow is an ordinary Solid child, not a
render prop — `typeof` cannot tell them apart, arity can, and Solid's own `<For>` passes its map fn
the same way. Of the 12 function children in the tree, **10 are zero-arity**; a blanket "any
function child refuses" would have thrown away 10 lowerable sites including `ActionButton`, whose
one definition is instantiated 146 times. The theoretical case that motivated the blanket rule — an
identifier whose arity is invisible at compile time — occurs zero times.

**A functional `style` refuses, full stop.** Not "unless both branches are static". Closing that
door properly would need the transform to split an object literal into pressed-dependent and
pressed-independent keys and EMIT CSS for the first half — a JS-to-CSS compiler in each of five
transforms. Every real call site instead migrates by hand in one edit: they already carry a class
(`className="action-button"` beside `style={({pressed}) => ({borderColor: color, opacity: pressed ?
0.6 : 1})}`), so moving `opacity: 0.6` into `.action-button:active` reduces `style` to a plain
object and the refusal lifts. Six component definitions across the six examples; instantiation
counts 181 / 161 / 156 / 146 / 137 / 68.

So `:active` is what code MIGRATES ONTO, never what fixes code in place — do not quote an
instantiation count as a win the feature delivers by itself.

## A refused Pressable still gets `:active`

`host.setPressed` in `adapters/solid/src/components/pressable.tsx` is the single point where press
state changes, and it drives TWO sinks: the Solid signal (framework-visible — a functional `style`,
a render-prop child, which is what forced the component in the first place) and `setHostPressed`
(engine-visible). So a refusal costs the component INSTANCE and not the pressed styling.

`setHostPressed` lives in the renderer, paired with `requestCommit()`, for the same reason
`removeNode` and `replaceText` are exported there: a press arrives from a NATIVE EVENT, outside any
renderer mutation, so nothing else schedules a commit. React's twin (`setNodeHidden` from
`hideInstance`) needs none because its reconciler is already mid-commit when it calls.

Pinned by `pressable-active-class.test.tsx`, and it needed pinning: every other Pressable test reads
props the SIGNAL produced, so all 437 stay green with the engine call deleted. Two harness facts
that cost time — fire responder events at the CREATED node's `instanceHandle` (`fabric.find`), never
at the committed node's `handle`; and read the resolved style off the committed PAYLOAD (`props
.opacity`), because `fabricProps` writes style keys straight into it and there is no `style` slot.

## The five-way switch, and the four tests it is expected to break

`Pressable` entered `HOST_PRIMITIVES` on 2026-08-23. Adding a stateful entry there turns lowering
on in EVERY transform at once, so it is the last step and its precondition is that all three
transforms already carry the `observesState` detections — verified by grep, not by asking:

```
adapters/solid/babel-lower-host-primitives.cjs
adapters/vue/babel-lower-host-primitives.cjs
adapters/vue/metro-vue-transformer.cjs
adapters/svelte/src/preprocessor/lower-host-primitives.ts
```

**Throwing it breaks four tests by design, and all four are correct-before / wrong-after rather
than regressions.** Three of them live in other adapters, so whoever throws the switch owns fixing
them — leaving another session three reds it did not cause is not a handoff:

```
solid    'leaves Pressable alone'                                  -> re-point at Switch
svelte   'does not touch a primitive we do not lower'              -> re-point at Image
vue      'does not lower a primitive that is more than a pass-through' -> Switch + Image
angular  'matches the exact union of symbiote-* selectors'         -> add the tag to the .cjs list
```

The first three assert the same thing they always did — _listing_ in the spec is what makes a tag
lowerable, never the name looking like a primitive — so only the subject moves. The fourth is drift
protection doing its job: `adapters/angular/babel-register-composed.cjs` hardcodes the selector set
(a plain `.cjs` Metro loads by raw `require`, with no transpile step to import the union from), and
the test catches any divergence from `ISymbioteIntrinsic`.

Three more things the tag needs, none of which any test would have caught on its own: the tag in
`ISymbioteIntrinsic` (`component-names/shared.ts`), `'symbiote-pressable': 'RCTView'` in BOTH
platform maps, and the Angular selector list. Without the platform maps `descriptorFor` cannot
resolve the lowered tag at all.

## Measured: lowering Pressable, and why the instance figure did not transfer

Device, 2026-08-23, back-to-back on one binary with only the spec entry between the arms:

```
             before   after            FABRIC identical in every row
Create        261.2   159.8   -38.8%   9000/8000/9 @ 32001
Replace       265.2   180.2   -32.1%   9000/8000/7 @ 32000
Append        258.6   166.8   -35.5%   9000/8000/9 @ 32001
```

VISITED (9041) and WRITES (12001) byte-identical, reconcile window +5% (inside its own ±8%). Tree,
engine work and Fabric requests all unchanged, so the whole 38.8% is pass 1 — the same oracle that
made the three earlier lowerings credible. **Create 0.86x and Append 0.60x against stock: the first
time an adapter has beaten stock React Native on a create row.** Replace gets no ratio; stock's own
Replace drifts 11%.

**~50 us per instance, four times the ~13 us a `View`/`Text` wrapper costs.** A per-instance cost is
not one number — it depends on what the body does. `Pressable`'s body runs `splitProps` over a
19-name list, `createSignal`, `createPressRuntime`, three `createMemo`s and a `createEffect`, and
renders a `View` COMPONENT inside itself, so a row shed four instances plus a press machine rather
than two wrappers. Quoting a single figure as "the cost of an instance" is the error this records.

Two operational notes worth keeping. The behaviour-registration gate never needs a separate
measurement arm again — headless could not resolve it, a bench put it at 0.08 ms, and the device
drowned it in 101 ms. And the FIRST run of this pair was taken with `batch-create` accidentally on:
it was caught in a second because FABRIC read 9000/**5000**/**1009** instead of 9000/8000/9, which
is the batching signature CLAUDE.md records. Read FABRIC before reading any timing.

All the small-ms rows moved the wrong way (Select 6.2 -> 9.0, Remove 7.2 -> 8.2, Clear 7.5 -> 24.2)
and none carries a verdict — the same non-reproducibility the table already records for stock's own
Clear (46.7 -> 7.7 with no code change).

## Re-levelling `examples/solid`: the adapter needs a manual pack, every time

`overlay-local-packages.mjs` (deleted 2026-09-02) did not carry adapters — the general trap, the self-confirming probe it
produces, and the `fix-esm-extensions` fingerprint that detects it all live in
`example-shared-package-staleness.md` (Check ZERO). What is Solid-specific:

Measured 2026-08-30, an overlay run reported `Done` with the engine at the current commit while
`adapters/solid` was still the 2026-08-23 build — `babel-lower-host-primitives.cjs` at 8.6K instead of
10.8K, and **no `build/state-style.js` at all**. That file is the runtime the transform emits for a
functional `style={({pressed}) => …}`, so the whole `activeStyle` path was absent from the example
while the engine looked fully levelled. A peer had already crossed off "stale slice" on that evidence
and was one step from changing `core/` to chase a Solid-only engine defect that did not exist. The
general form of that trap now lives in `example-shared-package-staleness.md`.

**Device settled it 2026-08-30: repacking the adapter alone fixed the first-press regression, with no
`core/` change**, and the bench rows confirmed the two press-path fixes are free — `VISITED` 9041,
`WRITES` 12001/0 and FABRIC 9000/8000/9 @ 32001 byte-identical across the pair.

The manual swap is licensed by the script's own subset rule — checked 2026-08-30, `adapters/solid` and
the installed copy carry the same four dependency names, so the swap installs nothing new:

```bash
cd adapters/solid && pnpm pack --pack-destination <tmp>     # never npm pack
rm -rf examples/solid/node_modules/@symbiote-native/solid && mkdir -p "$_"
tar -xzf <tmp>/symbiote-native-solid-*.tgz -C "$_" --strip-components=1
```

Then check the subpath the transform EMITS resolves, not just that the file shipped — a
`publishConfig.exports` entry missing its `types` half ships an untyped subpath no test catches:

```bash
node -e "console.log(require.resolve('@symbiote-native/solid/state-style',{paths:['examples/solid']}))"
```

And clear Metro's cache before the Release build: the transform is reached through the Babel preset,
whose `getCacheKey` surfaces only the upstream key, so a stale bundle survives the rebuild and reads
as "the change did nothing" — a measurement that lies rather than fails.

## The `ref` refusal is scoped to Pressable in Solid and universal in Vue — both are right

Landed 2026-08-31 with the invocation fallback. The shared table's `instance-bound-directive` row
says a `ref` on a lowerable primitive must REFUSE, and the two transforms implement it at different
widths. Copying either one onto the other is a regression.

```
Solid   View/Text declare `ref?: Ref<IHostInstance>` and forward it (view.tsx, applyHostRef)
        -> a lowered View hands back the SAME host instance the component did. Surface unchanged.
        -> Pressable declares NO public ref, so lowering would ADD one. Refuse there only.

Vue     a template ref on a COMPONENT yields the component instance, on an element the host node
        -> lowering changes WHICH OBJECT the app receives, for every primitive. Refuse everywhere.
```

The rule underneath is the same in both — a lowering transform is an optimisation, and an
optimisation that moves the observable surface in EITHER direction is a bug — and it produces
different code because the frameworks differ. This is `<adapter_src_follows_framework_idioms>`
reaching the transforms: a shared VERDICT, per-adapter width.

**The failure mode to guard against is harmonisation.** A later reader comparing the two transforms
sees Solid refusing on one primitive and Vue on all of them, reads it as drift, and widens Solid —
silently costing View/Text coverage for a hazard Solid does not have. That is the same mistake
`emitStyleExpressionOnce` already made once (`.claude/rules/adapter-parity-audit.md`): one
implementation's constraint promoted into a shared law. The oracle is the shared table, and the
table asks about `Pressable`; a difference outside what the table asks is not drift.

The first cut rode on `spec.observesState`, which was a COINCIDENCE — the one state-observing
primitive happens to be the one without a public ref — and it is now a named local set,
`INTRINSICS_WITHOUT_PUBLIC_REF`. It stays local rather than becoming a spec field, and the test for
which one it should be is worth keeping: **must all five adapters answer identically BY
CONSTRUCTION?** If a correct adapter can answer differently, the fact is per-adapter however shared
the rule consuming it is. Whether a primitive exposes a ref is a fact about one adapter's props
type, so it cannot be a field on `host-primitives.cjs` — the same criterion
`<prop_types_split_agnostic_vs_per_adapter>` applies to prop types.

A hand-written list of adapter members is what went stale three times this month, so it is checked
rather than trusted: `adapters/solid/ref-refusal-matches-components.test.ts` re-derives the answer
from each component's own props type (`ref?:` in `src/components/<name>.tsx`) and fails if a
primitive gains or loses that prop without the set moving. It carries its own break-test — asserting
`view`/`text` read `true` and `pressable` reads `false` — because a regex that quietly stopped
matching would make every row agree with an empty list and leave the suite green while the refusal
vanished.

## If `View` becomes a public TAG, this transform degenerates to a rename — for TWO of its four names

Measured 2026-09-01, answering the React arm in
`.claude/rules/capitalized-intrinsic-tag-feasibility.md`. The compile side holds:
babel-plugin-jsx-dom-expressions decides by CASE (`isComponent`, in @0.40.7) with no option to
change it, so Solid keeps a transform whatever the primitive is spelled. What changes is its KIND
— but only for the primitives whose transform work is a FOLD:

```
View Text     rename only — the alias fold and Text's two defaults already run in the RENDERER
              (foldAliasKey, seedTextDefaults + foldTextValue), including at PATCH time, so a
              bare tag inherits both. No fold-host-bag move needed here, unlike React.
Pressable     NOT a rename. specializeStateStyle is a compile-time rewrite and the engine has
              no runtime substitute.
TextInput     NOT a rename. intrinsicWhen has to become an engine-side choice at createElement.
```

**The Pressable half fails SILENTLY, which is what makes the order load-bearing.**
`resolveStateStyle` is a helper the transforms EMIT, not something the engine calls. A function
`style` on a bare tag is not an `on*` name, so it misses `setEventListener`, lands in `setProp` as
a function value, and `fabricProps` drops function props — the commit carries no style at all, the
same shape Svelte measured for a spread on a stateful primitive. Renaming before the engine can
resolve a state style takes every `style={({pressed}) => …}` call site to blank.

### What breaks in this adapter if `View` stops being a component

```
ref                      NOTHING, and this is the opposite of Vue. IHostInstance IS the engine
                         node (host-instance.ts re-exports it from the engine), `ref` on a
                         symbiote-* tag assigns the raw SymbioteNode, and applyHostRef only ever
                         calls the function branch. A tag hands back what the wrapper hands back.
splitProps               nothing — it lives in the wrapper body and goes with it.
createAnimatedComponent  RUNTIME break, worse than React's type widening.
withStableKeys           a surface change, not a break.
ReturnType<typeof View>  TS2344 on the two annotations in anchor-flatten-cost.test.tsx.
```

`createAnimatedComponent(Base: Component<any>)` ends `return <Base {...childProps} />`. `Base` is
capitalized, so the preset emits `_$createComponent(Base, …)`, and solid-js's `createComponent` is
`untrack(() => Comp(props))`:

```
createComponent('symbiote-view', {})   ->   TypeError: Comp is not a function
```

Three call sites — `AnimatedView` / `AnimatedText` / `AnimatedImage` in `modules/animated/index.ts`.
There is no escape hatch to widen into: `createRenderer()` from `solid-js/universal` returns twelve
names and `Dynamic` is not among them — `solid-js/web`'s Dynamic is DOM-only.

**Closed 2026-09-01**, ahead of the rename, by a `typeof Base === 'string'` branch inside the INNER
component — a parameter captured by a nested function is not narrowed by a check outside it. It is
two calls, not the hand-rolled reconstruction this section first budgeted for: `createElement(Base)`
then `spread(element, childProps, false)`, the same pair solid-js/web's own `Dynamic` makes on its
string branch. `insert` is not needed and neither is threading `ref`: universal's `spreadExpression`
skips `children` and `ref` in its prop loop and drives both through their own render effects. The
narrowing back to `ISymbioteNode` is a guard rather than a cast, because `createElement` is typed
over the renderer's node union and that includes the SURFACE.

Its test is `accepts a TAG as its base, not only a component`, and it cannot pass by accident: with
the branch deleted the mount dies with `TypeError: Comp is not a function` before any assertion
runs. Break-tested — exactly that one row moves.

`withStableKeys` reads as nothing and is not. Solid's `spread` has NO removal pass, so a bag whose
key set shrinks between runs leaves the last value on the native view forever; the wrapper widens
the key set on the author's behalf and a bare tag does not, so a consumer's own `{...bag}` spread
gets the raw behavior. Not a blocker for the rename — but it is a capability the wrapper supplies,
so it belongs on this list rather than in the "nothing changes" column.

### The create seam takes the TAG ALONE, which is what actually blocks the intrinsic choice

`nodeOps.createElement(tag)` is the whole signature — Solid builds the element from the tag and the
props arrive afterwards, one key at a time, through `spread` / `setProperty`. So
`resolveIntrinsicTag(tag, props)` cannot be called at create here, and neither can any other
create-time decision that needs to see the attributes. React's `createInstance` is handed `type` AND
`props`; this seam is handed a string.

Measured 2026-09-01, and it corrects a narrower claim made a round earlier in the same session — that
only the UPDATE half was unreachable. Both halves are. `dynamicIntrinsicChoice` and
`unreadableAttributeSet` therefore stand on the seam's shape, not on anything the engine's runtime
work changed, and no amount of runtime capability in `core/components` moves them on its own.

The consequence for which engine shape to ask for: a per-node data field (the tag, or the family's
alternative component) does not help, because the point where it would be READ has no props to
decide with. An engine-owned `maybeSwapIntrinsic(node, key, value)` beside `routeProp` does work,
precisely because it needs nothing at create — the node starts on the base intrinsic and swaps when
the deciding prop is written.

### The payload proof, and the double coverage that makes half of it toothless

`src/bare-tag-payload-parity.test.tsx` diffs a bare `<symbiote-view>` / `<symbiote-text>` against the
wrapper for the same authored props — sorted key set plus every value, not per-key assertions,
because once `View` is a string there is no component left to compare against and the comparison has
to have been recorded first.

Break-tested in both directions, and the asymmetry is the part worth keeping: disabling
`foldAliasKey` reddens the id row, disabling `seedTextDefaults` reddens the Text row — **but a break
in the WRAPPER's own fold stays green**, because the renderer catches it downstream. Both paths run
the renderer; only one runs the wrapper body. So this file proves the tag path is not MISSING a fold,
and proves nothing about the wrapper path having one. Do not delete a wrapper fold on the strength of
it.

### Routing a refused call site to the COMPONENT is reachable — and it inverts the safe default

Measured 2026-09-01, against the constraint that the consumer API may not change: if the public name
becomes a global string, a refusing call site still has to reach a component. It does, and the
machinery is already here — the plugin has a `Program` visitor that `unshiftContainer`s an
`importDeclaration`, so injecting an alias costs nothing new. Compiled with the installed preset,
both shapes come out of one pass:

```
<__SymbioteViewComponent foo="1"/>   ->  _$createComponent(__SymbioteViewComponent, {foo:"1"})
<symbiote-view foo="1"/>             ->  _$createElement("symbiote-view"); _$setProp(…)
```

The case rule that forces a transform on this adapter is the same rule that makes the escape work: an
injected CAPITALIZED alias is a component by construction. So the transform routes per call site and
the public name never appears in the output either way.

**What changes is the direction of safety, and it is the part to plan around.** Today a refusal is a
no-op: leave `<View>` alone and it is still a component that renders the right tag, so "when unsure,
do nothing" is correct and a missed call site costs only the optimisation. After the flip, doing
nothing emits `_$createComponent('symbiote-view', …)`, and a string is not callable — so the
transform goes from rewriting SOME sites to rewriting EVERY site, and an unsure case must be routed
to the component explicitly rather than skipped.

Two consequences worth carrying:

- **The failure is loud**, unlike the `descriptorFor` fall-through that resolves an unnormalised name
  to a Fabric view literally called `View` with no error at any layer. A `TypeError: Comp is not a
function` at first render is the better of the two failure modes, and it is what makes "rewrite
  every site" a survivable requirement rather than a silent-breakage one.
- **Shadowing gets harder, not merely preserved.** `LOWERABLE` is keyed on IMPORTED names today, so
  the import is the evidence that this `View` is ours. A global has no import, so the evidence
  disappears and the transform must treat any capitalized `View` that is not locally bound as ours —
  a widening whose failure mode is rewriting somebody else's component.

### There is no sanctioned way to declare a capitalized name a HOST element — read, not recalled

The right question is not "can our plugin go away" but "does Solid ship a supported way to say this
name is an element". Answer, read out of the installed source and confirmed against upstream `main`
on 2026-09-01: no, and the near-miss is instructive.

`isComponent` takes the tag NAME and nothing else — no config parameter, no lookup:

```js
function isComponent(tagName) {
  return (
    (tagName[0] && tagName[0].toLowerCase() !== tagName[0]) ||
    tagName.includes('.') ||
    /[^a-zA-Z]/.test(tagName[0])
  );
}
```

Identical in the two versions installed here (0.40.7, 0.40.10) and in `dom-expressions` main today,
so this is the current design rather than a version we are behind on.

**The plugin DOES have an element allowlist, and it sits on the wrong side of the gate.**
`transformElement` reads:

```js
if (isComponent(tagName)) return transformComponent(path); // decides first
const tagRenderer = (config.renderers ?? []).find(r =>
  r.elements.includes(tagName),
);
```

So `renderers[].elements` — the one option that names tags as elements — is only ever consulted for
a name that already failed the capital test. It selects WHICH renderer handles an element; it cannot
make something an element. It is also undocumented: the README describes the capital convention and
says nothing about `renderers`.

The full option surface, from the default config object plus what `babel-preset-solid` layers on:
`moduleName generate hydratable delegateEvents delegatedEvents builtIns requireImportSource
wrapConditionals omitNestedClosingTags omitLastClosingTag omitQuotes omitAttributeSpacing
contextToCustomElements staticMarker effectWrapper memoWrapper validate inlineStyles`. Two look like
doors and are not: `builtIns` auto-imports Solid's own capitalized components (`For`, `Show`) on the
COMPONENT path, the opposite direction; `contextToCustomElements` runs after the decision and only on
the DOM generator.

**Is it worth an upstream issue?** The gap is real and the shape is obvious — teach `isComponent` to
consult `renderers[].elements`, default empty so nothing changes. But it is NOT a two-line change,
and that is the part to carry into any proposal: the predicate is called from six places, and the
other five are semantic questions about the tree (static-expression detection, whether children are
dynamic, escaping). Flipping only the dispatch would leave five sites believing the name is a
component and produce subtly wrong static/dynamic decisions. A correct fix threads config into a
currently pure helper across three files.

#### `generate: 'universal'` changes nothing about the gate, and that is the sharpest form of the gap

Checked because it is the one thing that could have moved the verdict: `universal` is the mode
`babel-preset-solid` ships FOR a foreign host, which is exactly what this adapter is.

The gate is the first statement of the single entry point, four lines before any generator is
chosen — there is no separate universal entry:

```js
function transformElement(config, path, info = {}) {
  if (isComponent(tagName)) return transformComponent(path);   // decides
  const tagRenderer = (config.renderers ?? []).find(...);      // only for names that failed it
  ... generate === "dom" ? DOM : generate === "ssr" ? SSR : universal
}
```

The universal branch reads three config keys in total — `hydratable`, `wrapConditionals`,
`effectWrapper` — all shared, none about tags. So **the mode that exists for a non-DOM host gives
that host no way to name its own elements.**

**Only 2 of the 6 `isComponent` call sites are reachable on this path**, which is worth knowing
before anyone sizes an upstream change off the six:

```
transformElement$1 (universal) -> transformChildren      transformNode -> getStaticExpression  REACHABLE
transformElement$2 (SSR)       -> transformChildren$1    escapeExpression                      SSR only
transformElement$3 (DOM)       -> transformChildren$2    findLastElement, detectExpressions x2 DOM only
```

So on our generator it is the dispatch plus one shared predicate. The other four are semantic
questions asked only by the DOM and SSR generators — which does not shrink a correct upstream PR
(it must stay right for all three) but does concentrate its risk in generators we do not use.

#### What half A actually removes from this transform — measured, 2026-09-01

```
 184 / 499 lines and 134 / 270 CODE lines go outright
   state-style core                115 lines / 94 code
   resolveStateStyle helper import  30 / 20
   isFunctionStyle + its import     28 / 13
   renameAliasedAttributes          11 /  7
```

Half the code, a third of the bulk — the survivors are comment-dense rationale. What is left is not
"one binary check per occurrence": three live refusals (ref, renderPropChild, dynamicIntrinsicChoice),
the shadowing scan, and the new per-site routing emit. `canLower` and `intrinsicFor` shrink;
`lowerableLocalNames` GROWS if the public name ever becomes a global.

### The build-time state-style split is GONE, and Solid now emits no runtime helper either

Removed 2026-09-01, after measuring it rather than assuming it was a cost worth paying. The premise
handed round — that removing it moves work INTO the commit path — is backwards:

```
                       min / median ms, 10 000 styled nodes, 7 reps, headless
split (realistic)      12.9 / 15.6      two routeProp writes per node, two object literals
split-hoisted (bound)  10.9 / 11.2      both objects shared — the split's best case
callback               11.6 / 12.5      one write; routeProp resolves at both values of `pressed`
```

Counters and the committed payload are byte-identical in both arms, so the arms do the same work.
The mechanism is structural rather than a headless artifact — the split emitted TWO writes per node
where the callback emits one — and a write count does not change on a device. `split-hoisted` is the
arm that could have refuted this and did not: it prices the split's best case, and the installed
preset does NOT hoist (`<symbiote-pressable style={{…}} activeStyle={{…}} />` compiles to two inline
literals inside the element factory), so the realistic column is the first one. Re-runnable:
`adapters/solid/src/state-style-cost.bench.test.ts`.

**Solid now emits NOTHING for a functional style — not even the runtime helper Svelte emits.** Svelte
is the reference shape for "a transform may EMIT a payload module, it may not BIND one"
(`tests/lowering-transform-carries-no-behaviour.test.ts`), and it emits
`import { resolveStateStyle } …`. Solid passes `style={expr}` through verbatim and the engine's
`isStyleCallback` resolves it, so no helper import is needed at all. That is a legitimate divergence
and strictly simpler — do not read it as Solid missing something Svelte has, and do not "restore" the
helper emission to match.

It also makes `REFUSAL_CATEGORIES.emitStyleExpressionOnce` trivially satisfied here: the expression
appears once in the output because it is emitted unchanged. The category stays in the vocabulary
while Vue still specialises; `babel-lower-pressable.test.ts` pins the property directly
(`code.split(expr)` has length 2) rather than leaning on the category.

### A synthesised snippet with nothing BOUND is not the code an app writes

Three instances in one hour on 2026-09-01, all while building the lowering-equivalence arm, and all
the same shape: a test that constructs source or imports modules directly gets a program no
application would produce, and the difference reads as a product finding.

```
<Switch /> with no import        compiles to SOLID'S OWN control-flow Switch, auto-imported by
                                 babel-preset-solid's `builtIns` list beside For/Show/Match — a
                                 different component entirely, silently
components imported directly     `register.ts` never runs, so no behavior has a `foldPayload` and
                                 the lowered arm legitimately loses every behavior-side fold
```

The first is the new one and it generalises past this repo: **any primitive whose name collides with
a framework built-in is compiled correctly only when it is bound.** Ours is `Switch`. In app code the
import is always present, so the collision is invisible; in a fixture, a codemod, or a control
snippet it is silent and wrong. The fix is one line — synthesise the import too — and the tell is
that the compiled output names a local the snippet never declared (`_$Switch`).

The second cost three false "missing fold" differences on the equivalence arm's first run. An app
reaches `register.ts` through the package barrel; a test importing `./components/text-input` does
not. Import the side-effect module explicitly and say why, or the arm measures an unregistered
engine.

The rule that covers both: **write the snippet an app would produce, imports included, or the
harness is the finding.** Same family as the `head -1` glob that picked a `.test.ts` sibling — a
probe that constructs its own input is only as good as the input's resemblance to production.
