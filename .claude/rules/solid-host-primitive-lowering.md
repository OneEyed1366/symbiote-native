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

The first three assert the same thing they always did — *listing* in the spec is what makes a tag
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

`overlay-local-packages.mjs` does not carry adapters — the general trap, the self-confirming probe it
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
