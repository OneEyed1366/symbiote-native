---

> **DECIDED 2026-09-01 — HALF A. Half B (the global name) is skipped.** A primitive resolves to a
> TAG; the import stays exactly what an app writes today. Every cost this initiative surfaced
> belonged to half B, and an RN developer already writes `import { View } from 'react-native'`, so
> keeping the import is the one option that changes no consumer API at all. Read the pricing section
> below before reopening it.
name: symbiote-primitive-tags
description: >-
  Use when making a SymbioteNative primitive a public intrinsic TAG rather than a component
  (`export const View: 'symbiote-view' = 'symbiote-view'`), when planning or reviewing an adapter's
  lowering transform, or when asking why a primitive is still a wrapper. Holds the measured
  per-adapter feasibility matrix (React/Vue/Angular need no plugin; Solid and Svelte do, for
  different reasons), why the `symbiote-` hyphen WAS believed load-bearing in the internal tag and
  why that was superseded 2026-09-03 (re-measured on our own compiler configs, not stock ones), the three categories of component (native-backed / composition /
  framework-element-typed) and which can ever be tags, what a wrapper's prop folds must do before
  it can be deleted, and the four open engine and adapter items that block the remaining eight
  primitives. Trigger on: 'primitive as a tag', 'intrinsic element', 'drop the wrapper',
  'lowering transform', 'rename plugin', 'isCustomElement', 'JSX.IntrinsicElements',
  'HOST_PRIMITIVES', 'IHostBehavior', 'foldHostBag', 'why is View a component'.
---

# Primitives as public intrinsic tags

Every claim below came from running the adapter's own installed compiler or mounting through the
adapter's own harness. Where a session asserted something from first principles in this area it was
wrong roughly half the time, so prefer re-running a measurement to quoting one.

The intuition "JSX/Svelte reserve capitals for components, so a public primitive must be spelled
`<view>`" is right about the compilers and **wrong as an answer**, because two of the three
capital-sensitive frameworks never see a component at all. Measured 2026-09-01 by compiling
`<View foo="1" />` with each adapter's own installed compiler:

```
react    _jsx(View, …) with `export const View = 'symbiote-view' as const`
         -> element.type is the STRING. React host element, zero component instance.        YES
vue      compilerOptions.isCustomElement: t => t === 'View'
         -> _createElementBlock("View")  (default without it: _resolveComponent("View"))    YES
angular  selectors are arbitrary; case is not a rule                                        YES*
solid    _$createComponent(View, {…}) — decided by CASE at compile time, so a string-valued
         View still routes through createComponent and breaks                               NO
svelte   View($$anchor, { foo: '1' }) — a direct component call, no compiler option         NO
```

**TypeScript follows the value and still resolves `JSX.IntrinsicElements`** — the half that makes
React's route real rather than a runtime trick. With `View = 'symbiote-view' as const`, `<View
foo="1"/>` type-checks against the intrinsic's entry and `<View nope={1}/>` errors TS2322. So the
capitalized spelling keeps STRICT props; it does not degrade to loose host attributes.

One wrinkle on Vue: the emitted tag is literally `"View"`, not `symbiote-view`. The engine must
accept the alias or the compiler option must rename, so this route costs one name mapping.

`*` on Angular's YES — read the correction near the end of this file before relying on it. "Case is
not a rule" is true; it does not mean the tag needs nothing declared. `strictTemplates` still
requires a real declaration.

## Why it matters for lowering

Lowering is fragile because it collapses a COMPONENT — it must specialise a functional `style`,
choose an intrinsic, decide refusals, and keep the observable surface identical. If the primitive
is a primitive from the start, three adapters need no transform at all, and Solid's and Svelte's
degenerate to a 4-row tag-rename table with no prop analysis. That is a different class of
artifact from what `.claude/rules/adapter-parity-audit.md` §"fifth surface" guards.

## The boundary on "make everything lowerable"

A primitive is a primitive because it HAS A NATIVE VIEW. The engine's full set is ~11:

```
RCTView RCTText RCTVirtualText RCTRawText RCTImageView RCTScrollView RCTScrollContentView
RCTSafeAreaView RCTModalHostView RCTSinglelineTextInputView RCTMultilineTextInputView
AndroidSwitch AndroidTextInput RCTInputAccessoryView
```

FlatList / SectionList / VirtualizedList / Touchable* / KeyboardAvoidingView own no native view —
they are composition over ScrollView, and a browser would not make them tags either. "Every
component lowerable" is therefore MORE than browser parity, not equal to it; the honest target is
"every natively-backed view is a tag".

Before quoting any of this, note the method that produced it: each claim came from running the
adapter's own compiler, not from reading its docs. A prior turn in that same session asserted the
opposite for React and Vue from first principles and was wrong on both.

## Solid and Svelte cannot be configured into it — checked in the compilers, not the docs

Both decide in a hardcoded place, and neither exposes a hook:

```
solid   isComponent(tagName) — babel-plugin-jsx-dom-expressions@0.40.7 index.js:404,
        `tagName[0].toLowerCase() !== tagName[0]`. The plugin's full option set is
        builtIns contextToCustomElements delegatedEvents delegateEvents effectWrapper
        generate hydratable inlineStyles memoWrapper omit* renderers staticMarker
        validate wrapConditionals — nothing about tag case.
svelte  regex_valid_component_name.test(tag.name) in the PARSER
        (phases/1-parse/state/element.js:169), a module constant. Compile options are
        css cssHash customElement dev discloseVersion experimental fragments generate
        hmr modernAst namespace preserveComments preserveWhitespace runes — no hook.
        `customElement: true` is the OPPOSITE direction (compile a component INTO a
        custom element) and does not apply.
```

So those two keep a transform. What changes is its KIND: a rename table, not a lowering pass.

```
lowering today                          rename
reads attributes, decides lower/refuse  never looks at attributes
specialises a functional style          no
picks the intrinsic (intrinsicWhen)     no — the engine picks, at createElement
must preserve the observable surface    the surface IS the primitive
REFUSAL_CATEGORIES, fixture table       one map of 4 names
```

The only correctness check a rename owes is **shadowing**: skip the rewrite when the name is bound
locally (an import or a local `const View`). Solid's runs as a Babel plugin ordered BEFORE
`babel-preset-solid`; Svelte's is the existing preprocessor, still after `scopedStyles`.

### Svelte's does NOT reduce to that table, and the reason is below tag case

Measured 2026-09-01. Svelte's transform does not merely choose a tag: it converts the attribute
list into ONE `p={{…}}` bag (`lower-host-primitives.ts:420`), and that bag is the only path into
the engine. `ShimElement.setAttribute` (`dom-shim/element.ts:89`) writes a private Map and never
reaches `routeProp` — inert, not lossy. Compiling both shapes with the installed 5.56.8:

```
<symbiote-view class="x" nativeID={id} style={s}>   set_class + set_style
                                                    + set_custom_element_data(node,'nativeID',id)
<symbiote-view p={{class,nativeID,style}}>          set_custom_element_data(node,'p',{…})
```

Three helpers, and the shim implements none of the first three: `set_class` writes
`dom.className` / `setAttribute('class')` (class.js:14), `set_style` writes `dom.style.cssText`
(style.js:31), and `set_custom_element_data` EXCLUDES `style` outright — attributes.js:246, "`style`
should use `set_attribute` rather than the setter". So a bare rename gives silence on `class`,
silence on `style`, and stringified scalars elsewhere, with nothing red. **The hyphen and the bag
are one mechanism seen from two sides**: the hyphen puts the tag on the custom-element codegen path,
the bag is what makes that path usable.

What a public primitive DOES remove there — most of the file, but not the attribute reading:

```
drops   the compile-time folds (id -> nativeID, Text defaults); foldHostBag is runtime and now
        in core/components, so the compile-time reproduction stops being needed
drops   the intrinsic choice, once the engine picks at createElement
keeps   the import scan + shadowing — how it knows which local names are primitives
keeps   building the bag from the attribute list
keeps   specialising a functional style (compile-time rewrite, Pressable only)
```

The route to a real table exists and is a TRADE, not a no: teach the shim `className`, a `style`
object with `cssText`, and per-key `set_custom_element_data`, all funnelling into `routeProp`. The
cost is the per-key diff in the `p` setter, which that file calls mandatory rather than an
optimisation — `set_custom_element_data` has no early-out and re-fires on every effect, so without
one bag write plus a diff every prop is rewritten whenever any one changes. Needs a benchmark
number before anyone picks it.

**And the `createAnimatedComponent` wrinkle recurs, with no Svelte equivalent of React's fix.**
`Animated.View` / `Animated.Text` (`modules/animated/index.ts:92`) pass `View` as a VALUE, and
`createAnimatedComponent(Base)` returns a component that CALLS `Base`
(`create-animated-component.ts:119`). React widened to `ComponentType<P> | string`; Svelte has no
`createElement` to hand a string to, so this needs its own answer before View/Text become tags
there. Nothing else in the adapter treats them as components — zero internal `<View>`/`<Text>`
usages in its own `.svelte` files — and `bind:this` improves, yielding the ShimElement that
`hostInstance()` already expects instead of the wrapper.

### Vue's two paths need two DIFFERENT mechanisms, and only one of them is the option

Measured 2026-09-01 by compiling through each installed compiler. The "one compiler option, no
plugin" reading holds for the SFC path and is FALSE for JSX/TSX — and the reason is not that the
option is missing, it is that the option never runs:

```
SFC  @vue/compiler-sfc compileTemplate
     default                              _createBlock(_component_View
     isCustomElement: t=>t==='View'       _createElementBlock("View")

TSX  @vue/babel-plugin-jsx 1.5.0
     import { View } … <View/>            _createVNode(View)     <- unchanged BY THE OPTION
     same + isCustomElement:t=>t==='View' _createVNode(View)     <- still unchanged
     NO import + isCustomElement          _createVNode("View")
```

`getTag` (dist/index.js) decides `path.scope.hasBinding(name) ? identifier(name) : isCustomElement?.(name) ? stringLiteral(name) : resolveComponent(name)` — **the scope binding is checked BEFORE the option**. Every real TSX file imports its primitives, so `isCustomElement` is dead code on that path. It exists for the un-imported spelling, which nobody writes.

**TSX gets React's route instead, and needs nothing at all.** `h('symbiote-view')` produces a vnode with `shapeFlag & ELEMENT` set and no component bit (measured), so `export const View: 'symbiote-view' = 'symbiote-view'` makes `_createVNode(View)` an element vnode — identical to React's arm, with `@vue/babel-plugin-jsx` untouched.

**So Vue is not one mechanism, it is two — and that is what settles the tag-name question.** The two paths then emit different tags for the same source:

```
SFC  isCustomElement          ->  "View"
TSX  string-valued export     ->  "symbiote-view"
```

The engine accepting the alias would leave Vue's own two paths disagreeing, and their agreement is P0 before either agrees with another adapter (`adapter-parity-audit.md`, "the fifth surface"). So the SFC transformer renames — not as a preference for one internal alphabet, but because nothing else makes the two paths emit the same thing.

The rename is CHEAPER than the lowering rename it replaces. Today the parser has already typed `<View>` as a component, so `tagType` must be flipped in the same pass or codegen emits slot children an element path never mounts (`metro-vue-transformer.cjs`, `createHostPrimitiveLowering`'s header). With `View` in `isCustomElement` the parser types it ELEMENT up front and the nodeTransform only rewrites the tag string. Both paths already build an `isCustomElement` — SFC in `templateOptions`, TSX in `babel-jsx.cjs`'s `isSymbioteIntrinsic` — so the wiring exists; only the predicate widens.

### What in the Vue adapter treats View/Text as a component

Three things, and the internal call sites are already fine:

```
components.ts hostComponent()   normalizeVueAttrs + Text's resolveTextProps   -> must move down
create-animated-component.ts    createAnimatedComponent(Component: Component) -> widen to |string
components.ts HOST_VIEW/HOST_TEXT  already exported, already used by our own
                                   Pressable/Button instead of h(View, …)     -> nothing to do
```

`normalizeVueAttrs` is the one with no React counterpart: it folds a template's kebab attrs
(`:accessibility-label`) to the RN camelCase contract, and a bare tag has no wrapper to do it in.
Whether `foldHostBag` covers it or Vue needs its own step is the open question, not the folds
themselves. `createAnimatedComponent` is the same wrinkle React widened and Svelte reported as
unsolved — Vue's is the easy version, because its body already calls `h()`, which takes a string.

### The ref hazard does NOT apply to Vue's View/Text — they are FUNCTIONAL

`adapter-parity-audit.md` records "vue: a template ref on a COMPONENT yields the component instance,
on an element the host node -> lowering changes WHICH object the app gets, for every primitive."
That is true of a STATEFUL component and false of these two. `hostComponent()` returns a
`FunctionalComponent`, and its header says why — a functional component has no instance, so Vue's
`setRef` falls through to `vnode.el`. Measured through the adapter's own mount:

```
h(View, { ref })              isSymbioteNode(ref.value) === true
h('symbiote-view', { ref })   isSymbioteNode(ref.value) === true
```

So tagging moves nothing on the ref surface for `View`/`Text`. It still applies to `Pressable`
(`pressable.ts`) and `TextInput` (`text-input/index.ts`), both `defineComponent`. Same shape as the
`ref-refusal-matches-components` proxy in `verify-the-deciding-side.md`: the rule was right about
the sample it was drawn from, and the sample was all stateful.

## The one decision this moves, and it moves the right way

`intrinsicWhen` (TextInput `multiline` -> `RCTMultilineTextInputView`) is a COMPILE-time choice
today, which is why `dynamicIntrinsicChoice` had to be a refusal category. With a public primitive
the choice belongs to the engine at `createElement`, where the runtime VALUE is known — and a later
flip re-creates the node, exactly as a browser re-initialises on `<input type>` change. That is a
capability the compiler never had, so the category disappears with the transform rather than
migrating into it.

## React is the CHEAPEST of the five, which contradicts a line in root CLAUDE.md

That line — "React and Angular still trail … React cannot be lowered the same way (no build-time
analysis; host and composite are both fibers)" — is true about LOWERING and false about the goal.
React reaches the same end state with no build step at all, because its wrapper is already almost
nothing:

```ts
// adapters/react/src/components.ts:102
export const View: FC<IViewProps> = props =>
  createElement('symbiote-view', resolveAccessibilityProps(resolveId(props)));
```

The component exists only to apply two prop folds. Move those into the primitive's
`IHostBehavior.foldPayload` — the seam that already exists for exactly this — and the whole body
becomes `export const View = 'symbiote-view' as const`. `host-config.ts:143` already resolves a
string type through `descriptorFor(type)`, so the reconciler side needs no change.

So the per-adapter cost is: react = delete a wrapper; vue/angular = a compiler option / nothing;
solid/svelte = a rename plugin.

## Is this NativeScript's model? Yes in shape, no in price

NativeScript also makes views global tags owned by the runtime rather than components imported from
a library, and it hit this exact fork first: `nativescript-vue` / `nativescript-angular` write
`<Label>`, while **svelte-native was forced to lowercase** for the same parser rule measured above
(halfnelson/svelte-native#112). So the precedent says a per-framework spelling split is liveable.

The difference is how the tag is known. NativeScript registers into a RUNTIME registry
(`registerNativeViewElement('mapBox', () => …)`) and resolves by name at render, which is why its
typing has always been an afterthought. Our routes are compile-time: a typed string constant
(React), a compiler predicate (Vue), a selector (Angular). Measured above, `JSX.IntrinsicElements`
still applies and a bad prop is TS2322 — so this buys NativeScript's ergonomics without giving up
the types, and without NativeScript's other half (its own native layer; ours stays stock Fabric +
Yoga per `<native_core_is_untouched>`).

## The real count is 12 primitives, 4 done, 8 left — and the tags ALREADY EXIST

`core/components/src/component-names/index.ios.ts` is the authoritative tag -> native view map, and
it already carries all 18 intrinsics. Collapsing the internal variants (scroll content, horizontal,
managed, multiline) gives 12 PUBLIC primitives:

```
done      View->RCTView  Pressable->RCTView  Text->RCTText  TextInput->RCT{Singleline,Multiline}
left      Image->RCTImageView            ScrollView->RCTScrollView
          Switch->Switch                 ActivityIndicator->ActivityIndicatorView
          SafeAreaView->SafeAreaView     Modal->ModalHostView
          RefreshControl->PullToRefreshView   InputAccessoryView->RCTInputAccessoryView
```

So the work is NOT "finish lowering for 11 components". The engine already creates every one of
these nodes; what is missing is the `IHostBehavior` half — the prop folds, defaults and state
machine currently sitting in each adapter's wrapper body. Cheap ones are fold-only
(ActivityIndicator, SafeAreaView, InputAccessoryView, Image); expensive ones own state or an
imperative handle (ScrollView, Modal, Switch, RefreshControl).

Everything else exported by an adapter — Button, ImageBackground, KeyboardAvoidingView, FlatList,
SectionList, VirtualizedList, VirtualizedSectionList, the four Touchable* — owns no native view and
stays a component.

## Do NOT make the non-primitives globally available too

The instinct is symmetry: if `View` needs no import, `FlatList` should not either. The browser is
the counter-example — it exposes ~110 tags and zero global components, and nobody experiences that
as an inconsistency. **The asymmetry IS the model**: a tag is the platform, a component is a
library.

It is also only possible in one adapter. Vue has `app.component('FlatList', …)`; Angular's
standalone components require `imports[]`; React, Solid and Svelte resolve a capitalized tag as an
identifier in scope, so "global" means a real `globalThis` binding plus `declare global`. That
forfeits tree-shaking on precisely the heaviest modules in the package (the virtualized list
family) and makes the bundle non-analysable — paid on every app, to save one import line.

## The global/import line must follow PRIMITIVE-vs-COMPONENT, never DONE-vs-NOT-DONE

RN developers expect everything to be imported, so making `View` global is a promise about the
whole category. If `View` needs no import and `Modal` still does — because its behavior is not
written yet — the model reads as broken rather than incremental. So the 8 remaining behaviors are
ONE atomic switch, not a delivery sequence: until all 12 are ready, none is global.

**In React the two spellings coexist for free**, which removes the migration risk entirely:
`export const View = 'symbiote-view' as const` is still an ordinary export, so
`import { View } from '@symbiote-native/react'` keeps working unchanged and resolves to the same
string. Global is ADDITIVE there; nobody has to choose.

**In Vue it is not — measured 2026-09-01, and this is the constraint that forces the atomic
switch.** `isCustomElement` beats a local binding: compiling `<View/>` with
`bindingMetadata: { View: 'setup-const' }` still emits `_createElementBlock("View")`. So a
primitive TAKES the name irreversibly — an app cannot define its own `View`, and every name added
to the set is a breaking change for whoever already used it. The occupied set is therefore public
API and must be declared once, complete.

```
react / solid / svelte   name resolves in scope   -> a local binding shadows the primitive
vue / angular            compiler / selector      -> the primitive wins, the name is taken
```

**PARTLY SUPERSEDED — the Vue row is half wrong, and the atomic rule survives for a DIFFERENT
reason.** The measurement above was mine, not the Vue session's, and I attributed it to them in a
work brief; they re-ran it across every binding kind and TSX INVERTS — a local `const View` shadows
the primitive there exactly as in React and Solid, option or no option. So Vue does not take the
name; half of Vue does. What forces the atomic switch on Vue is that one source spelling would then
behave differently in an app's `.vue` and `.tsx` files — the two-path drift this repo already
treats as P0. **Quote the asymmetry, never the irreversibility**: the irreversibility argument is
half false and the next reader who checks it will find that out. Full table in "Vue, item 2".

Guard it structurally, the way `adapterNames()` guards the adapter list: assert that the globally
declared tag set, `HOST_PRIMITIVES`, and the public primitives in `component-names` are the SAME
set. Three hand-written lists of one contract is exactly the shape that drifts here.

## Lifecycle is NOT what blocks a component from becoming a tag

The natural assumption — "the rest is JS logic tied to the adapter's lifecycle, so it cannot leave
the adapter" — is already disproven by what shipped. `Pressable` owns a press state machine and
`TextInput` owns controlled-value state; both are tags today. Their machines live in
`core/components/src/behaviors/{pressable,text-input}.ts` and the engine drives them from events.
No adapter lifecycle participates. So state and logic move to the engine fine.

**What cannot move is a prop that RETURNS a framework element.** `renderItem: (info) => ReactNode |
VNode | Snippet`, `ListHeaderComponent`, `ItemSeparatorComponent` — the engine has no way to type
that result and no way to construct one; constructing framework elements is the definition of an
adapter. This is `<prop_types_split_agnostic_vs_per_adapter>` restated at the tag level.

Measured 2026-09-01, the blocker is confined to four components:

```
flat-list  virtualized-list  virtualized-section-list  section-list     ListHeader/Footer/Empty/
                                                                        ItemSeparatorComponent,
                                                                        renderItem, renderSectionHeader
```

So there are THREE categories, not two:

```
1  native view of its own        View Text Pressable TextInput Image ScrollView Switch
                                 ActivityIndicator SafeAreaView Modal RefreshControl
                                 InputAccessoryView                        -> must be tags (12)
2  composition of OUR nodes,     Button ImageBackground KeyboardAvoidingView
   no framework-element prop     Touchable*                    -> COULD be tags; a perf call,
                                                                  decided by measurement
3  takes a framework element     the four list components      -> never a tag, by TYPE
```

Category 2 is the one to state carefully: nothing architectural stops it, because a tag may create
a fixed internal structure (`symbiote-scroll-view` already creates a content node beside itself).
Turning one into a tag removes a component instance and changes nothing natively — so it is decided
on numbers, not on principle. Category 3 is the only genuine "cannot", and the reason is the type,
not the amount of work.

## What actually disappears, and what the adapter is left with

More disappears than the wrappers. For a primitive, the THREE-layer split of
`<components_split_logic_view_lifecycle>` collapses to two: the engine builds the node directly, so
the primitive's `core/components/src/view/render-*.ts` goes with its wrapper — the Descriptor tree
existed to be turned into framework elements, and there are none left to turn it into.

```
core/components/src/view/  (17 files)
  goes    render-{activity-indicator,image,input-accessory-view,modal,pressable,
          scroll-view,switch,text-input}          8, the category-1 set
  stays   render-{button,image-background,keyboard-avoiding-view,touchable-highlight,
          touchable-native-feedback}, scroll-sticky, layout-event
```

**But the adapter does NOT become "just registering custom views".** Registration is barely a step:
React needs zero (`export const View = 'symbiote-view' as const`; `host-config.ts:143` already
resolves a string through `descriptorFor`), Vue needs a compiler option in the Metro transformer,
Solid and Svelte a rename plugin, Angular a selector/schema. What remains in the adapter is its
real content:

```
the reconciler        host-config / createRenderer / Renderer2 / the Svelte DOM shim
the four lists        category 3 — framework elements by type
category 2            until measured and moved
portal / tunnel       createPortal, createTunnel, Teleport shims
lifecycle surface     use*/create*/services, Animated wiring
descriptorTo*         still used by 2-13 non-test files per adapter, for categories 2 and 3
```

So the adapter thins toward what root CLAUDE.md already calls it — a thin reconciler — rather than
toward a registration table. Saying "adapters just register the views" undersells what is left and
would read as a promise the next refactor cannot keep.

## Dropping the `symbiote-` prefix: safe for the PUBLIC name, fatal for the internal tag

> **The "fatal" half is SUPERSEDED — see the subsection at the end of this section (2026-09-03).**
> Kept in full because the METHOD failure is the reusable part.

Two different names are involved, and conflating them is the trap. The public name is what a
developer types; the internal tag is what the compiler and the engine see. Only the second is
constrained — and it is constrained hard, because `view`, `text`, `image` and `switch` are all real
SVG elements.

Measured 2026-09-01 on both compilers:

```
                 svelte                                    solid
symbiote-view    from_html + set_custom_element_data       _$template(`<symbiote-view …`)
view             from_svg  <- SVG NAMESPACE                _$template(`<svg><view …`)   <- same
text             from_svg                                  _$template(`<svg><text …`)
image            from_svg                                  _$template(`<svg><image …`)
switch           —                                          _$template(`<svg><switch …`)
View             View($$anchor, …)  (component)            _$createComponent(View, …)
```

Two independent failures from one rename. The tag lands in the SVG namespace, and Svelte drops off
the custom-element codegen path — so `set_custom_element_data` is replaced by attribute writes,
which stringify. The whole flat-bag strategy (`svelte-adapter-dom-shim`: ONE object prop that must
land as a PROPERTY set) breaks silently. **The hyphen is load-bearing, not cosmetic.**
**-- SUPERSEDED 2026-09-03: on OUR configs the bag still lands as a property. See the subsection
at the end of this section before acting on this paragraph.**

**The capital letter is what makes the public name safe**: the SVG collision fires only on the
lowercase spelling. `<View>` / `<Text>` / `<Image>` / `<Switch>` are a component to Svelte and Solid
— which the rename plugin then rewrites to `symbiote-*` — so the short lowercase form never exists
at any stage.

```
developer writes   View  Text  Image  Switch      (never sees a prefix)
react              a string const whose VALUE is 'symbiote-view'
solid / svelte     rename plugin  View -> symbiote-view
vue                emits the tag literally as "View" — the engine must accept that name too
angular            selector, unconstrained
```

So: drop the prefix from the public API, keep it in the internal alphabet. Anyone "simplifying"
this by making the tags plain lowercase gets an SVG namespace and stringified props, on device,
with every test green. **-- FALSE on our configs; read the subsection immediately below before
quoting this sentence.**

### SUPERSEDED 2026-09-03 — re-measured on OUR configs, and both failures disappear

The table above is stock-compiler output. Re-run through the pipelines this repo actually ships —
`adapters/solid/babel-preset.cjs` (`generate: 'universal'`) and
`adapters/svelte/metro-svelte-transformer.cjs`'s `COMPILER_OPTIONS` (`fragments: 'tree'`) — the
hyphenless lowercase form is not blocked on either:

```
solid    <symbiote-view p={{a:1}}/>   _$createElement("symbiote-view"); _$setProp(el,"p",{a:1})
         <view          p={{a:1}}/>   _$createElement("view");          _$setProp(el,"p",{a:1})
         <text> <image> <switch>      same, verbatim.   <View/> -> _$createComponent(View, …)

svelte   <symbiote-view p={p}/>       from_tree([['symbiote-view']], 2)  set_custom_element_data
         <view          p={p}/>       from_tree([['view']],          4)  set_attribute
         <stacklayout   p={p}/>       from_tree([['stacklayout']],   4)  set_attribute
```

Solid's `_$template` line in that table (the one wrapping `<svg><view …`) is the DOM generator. Universal mode emits calls into our
renderer and builds no template string at all, so there is no HTML parser and therefore no
namespace to switch. The SVG half of the finding does not reach us.

Svelte's codegen genuinely differs — and the COMMITTED tree does not. Mounted through the real
`mount()` against `installFabric()`:

```
symbiote-view   RCTView       { testID: "probe", nativeID: "x" }
view            view          { testID: "probe", nativeID: "x" }
stacklayout     stacklayout   { testID: "probe", nativeID: "x" }
```

The bag lands as a PROPERTY on all three. `set_attribute` (svelte `dom/elements/attributes.js:204`)
routes a NON-STRING value to `element[attr] = value` whenever `get_setters(element)` finds the
setter; `p` is a getter/setter pair on `ShimElement.prototype` (`element.ts:86,90`); and
`patch-globals.ts:79` sets `g.Element = ShimElementBase` — an empty class BELOW `ShimElement` —
exactly so `get_setters`, which stops at `Element.prototype`, still reaches it. The shim's own
comment says so. **`stacklayout` behaving identically to `view` is what proves the discriminator
was the HYPHEN and never the SVG word**; the original entry fused two mechanisms into one clause.

**What this does NOT clear.** Svelte swaps `importNode` for `cloneNode` (flag 2 -> 4), and this
skill elsewhere calls `importNode` the primary clone path that must be watched — one probe is not
that suite. The engine's tag->component table knows only `symbiote-*`, so a hyphenless tag commits
`viewName: "view"`. React, Vue and Angular were not in this pass; React additionally augments
`declare module 'react'`, so a lowercase `view` collides with `@types/react`'s SVG entry (TS2717)
until React moves to its own `jsxImportSource`, which Solid already has
(`adapters/solid/src/jsx-runtime.ts`).

**And the method, which outlives the verdict: the superseded numbers were taken on the compilers'
STOCK configuration, not on ours, and nothing in the record said which.** A single generator flag
deleted the whole mechanism the finding was named after. When a finding is about a compiler, record
the options it was compiled with, or the next reader inherits a fact about somebody else's build.

## The React arm was BUILT, 2026-09-01 — what it cost and what it uncovered

`View` and `Text` are now the intrinsic tags in `@symbiote-native/react`, not components:

```ts
export const View: 'symbiote-view' = 'symbiote-view';   // a type annotation, not `as const` — no cast
export const Text: 'symbiote-text' = 'symbiote-text';
```

Result: tsc clean, 614 files / 5 259 tests green, and `<View nope={1}/>` still errors TS2322 against
`IViewProps` — measured on the real barrel, not a toy file. The wrapper bodies died because both of
their folds already had a home one layer down: the aria fold runs in the engine (`fabricProps` ->
`foldAriaProps`), and `id -> nativeID` plus Text's defaults now run in the renderer from the spec.

**The fold moved to `core/components/src/fold-host-bag.ts`** (subpath `./fold-host-bag`), lifted out
of `adapters/svelte/src/dom-shim/`, which now re-exports it. It left the adapter the moment a second
one needed it: a bare tag has no wrapper to fold in, which is the same "third path" Svelte wrote it
for, arriving in an adapter that has no lowering transform either. React's `host-config` calls it in
`createInstance` and on BOTH sides of `commitUpdate` — folding only the new side diffs a raw `id`
against a folded `nativeID` and never clears the raw key.

Three things the experiment uncovered that were not part of the plan, and the second is the one to
carry:

- **`createAnimatedComponent(View)` took `ComponentType<P>`**, so a tag did not type-check. Widened
  to `ComponentType<P> | string` with a `typeof base === 'string'` branch for the displayName.
- **`src/jsx.d.ts` reached NO consumer.** A hand-written `.d.ts` is not emitted to `build/`, is not
  in `files`, and was imported by nothing — so the intrinsic table applied inside the package only.
  Invisible while `View` was a component (its props came from `FC<IViewProps>`), and blocking the
  moment `View` became the tag, because an app resolves `<View/>` through `JSX.IntrinsicElements`.
  Now `src/jsx.ts`, re-exported from the barrel, emitting `build/jsx.d.ts`. **Check this on every
  adapter before its arm: a type that ships only inside the package is not a public type.**
  It had also been referencing `ViewProps`/`TextProps`, which do not exist — `skipLibCheck: true`
  hid that too.
- **Text's defaults were asserted by NOTHING in this adapter.** Added
  `src/__tests__/text-defaults.test.tsx`, including the `allowFontScaling={false}` case that
  separates `notFalse` from a plain `??`. Negative control run: disabling the fold reddens 4 tests
  across two files, so it is wired and not decorative.

## RN already did half of this, wrote down that it wants the rest, and shipped a flag for it

Worth knowing before anyone frames the tag model as a departure from React Native. Measured in
`.vendors/react-native` 0.86:

```
NativeComponentRegistry.js:112     return name;          <- get('RCTView') IS the string
ViewNativeComponent.js             export default ViewNativeComponent   <- the tag is already public
```

So RN's primitive tag exists, is a string, and is exported. `View.js` is a wrapper over it, and the
file says what the wrapper is for:

```
// Additional note: Our long term plan is to reduce the overhead of the <Text>
// and <View> wrappers so that we no longer have any reason to export these APIs.
```

What the wrapper still does is exactly the two things ours did — `use(TextAncestorContext)` and ~40
lines of aria/`id` folding — and the folding half is ALREADY behind a feature flag,
`ReactNativeFeatureFlags.enableNativeViewPropTransformations()`: when it is on, the whole block is
skipped because native does it. Same direction, same reason.

So the honest framing is not "RN chose components, we chose tags". It is that RN is walking the same
road with two constraints we do not have: a public API frozen since 2015, and `react-native-web` /
macos / windows, which substitute the COMPONENT — a string tag offers no substitution point. Our
`TextAncestorContext` equivalent is also already gone (`viewNameFor` in `core/engine/src/commit.ts`
resolves RCTText vs RCTVirtualText during the commit walk), which is why the wrapper could go here
and cannot yet go there.

## CORRECTION: "the transform degenerates to a rename" is FALSE for Svelte — the decider is the PROP PATH, not the tag case

The rename framing above was derived from tag-case measurements and it generalised one adapter's
compile output into a claim about two. The Svelte session refuted it the same day, with file:line,
and both of its load-bearing facts were re-verified here rather than relayed:

```
svelte/…/attributes.js:246-247   prop !== 'style' — "`style` should use `set_attribute`
                                 rather than the setter"          <- style is EXCLUDED
adapters/svelte/src/dom-shim/element.ts:89   setAttribute writes a private Map and returns.
                                 The engine is reachable ONLY through `set p`.
```

Svelte's transform does not choose a tag. It converts the attribute list into ONE `p={{…}}` bag
(`lower-host-primitives.ts:420`), and the shim's `p` setter is what calls `foldHostBag` and
`routeProp`. A rename would leave the attributes as attributes, and the compiler then emits three
different paths the shim implements none of:

```
class   -> set_class                 dom.className / setAttribute('class', …)
style   -> set_style                 dom.style.cssText — and excluded from the CE setter
other   -> set_custom_element_data   stringifies scalars
```

class silent, style silent, the rest stringified, nothing red. So the hyphen finding above and this
one are the same mechanism from two sides: **the hyphen puts a tag on the custom-element path, and
the bag is what makes that path usable** — losing either breaks it.

What a public primitive DOES remove from Svelte's transform, which is still most of the file:

```
drops   the compile-time folds (id -> nativeID, Text defaults) — foldHostBag is runtime now
drops   the intrinsic choice, once the engine picks at createElement
keeps   the import scan + shadowing, the bag construction, the functional-style specialisation
```

Call it **bagging**, not lowering. A real rename table is reachable only by teaching the shim
`className`, a `style` object, and per-key `set_custom_element_data` — and that trades away the
per-key diff in the `p` setter, which the shim's header calls MANDATORY: `set_custom_element_data`
has no early-out and re-fires on every effect, so per-key writes rewrite every prop whenever one
changes. Needs a number before anyone picks it.

**The general rule, and it is `verify-the-deciding-side.md` pointed at my own framing: tag case
decides whether a transform is NEEDED, not what the transform must DO.** What it must do is decided
by how that adapter's props reach the engine, which is per-adapter by construction. Solid's route
may or may not be a rename — nobody has measured its prop path, only its tag output.

## `createAnimatedComponent` breaks on every adapter, and only React can widen its way out

React's `createAnimatedComponent(View)` took `ComponentType<P>` and was widened to
`ComponentType<P> | string`, because `createElement` accepts a string. Svelte's twin
(`modules/animated/index.ts:92` -> `create-animated-component.ts:119`) CALLS its `Base`, and a
string is not callable — there is no `createElement` to hand it to. So `Animated.View` needs its own
answer per adapter before that adapter's primitives can be tags, and React's fix does not transfer.

Check this file first when scoping any adapter's arm: it is the one call site that treats a
primitive as a component by necessity rather than by habit.

## CORRECTION: Angular's "YES, no transform" is wrong — ngtsc needs the tag declared, and the cheap way to declare it is a Directive, not a schema

The opening table's Angular row ("selectors are arbitrary; case is not a rule") is true and was
read as "so nothing needs declaring, unlike Solid/Svelte's rename plugins" — that second half is
false. Measured 2026-09-01 with real `ngc -p tsconfig.angular.json --compilationMode partial`
compiles (`strictTemplates: true`, matching every app in this repo), throwaway probe files, cleaned
up after:

```
<NoHyphenTag foo="1">         no matching component/directive, no schemas   NG8001, exit 1
<symbiote-probe-tag foo="1">  same, hyphenated                              NG8001, exit 1
```

So a bare unclaimed tag — hyphenated or not — errors under `strictTemplates`. This project's own
`angular-adapter-renderer.md` already says `CUSTOM_ELEMENTS_SCHEMA` closes NG8001 for a hyphenated
tag; what was missing here is that CUSTOM_ELEMENTS_SCHEMA is a real per-app-component cost
(`schemas: [CUSTOM_ELEMENTS_SCHEMA]` on every consuming component) and, per that same rule, only
ever accepts a hyphenated name.

**The cheap alternative, verified the same session: a plain `@Directive` with no view of its own,
selector matching the tag, and one `@Input()`/`@Output()` per prop.**

```ts
@Directive({ selector: 'symbiote-view', standalone: true })
class ViewDirective { @Input() foo?: string; }
```

closes BOTH NG8001 (unknown element) and NG8002 (unknown property, when every real prop gets an
`@Input()`/`@Output()`) with zero schema anywhere. Cost to the app is exactly what it already pays
today for a component primitive — the directive goes in `imports: [ViewDirective]` — and it is
STRICTER than CUSTOM_ELEMENTS_SCHEMA, which accepts any property on any hyphenated tag rather than
checking the real prop surface.

**And the hyphen turns out not to be required either, specifically for this route.** A directive
selector is matched by the compiler's own directive-matcher, not by the DOM schema registry that
gates `CUSTOM_ELEMENTS_SCHEMA` — verified: `@Directive({ selector: 'ProbeNoHyphenTag' })` with
`<ProbeNoHyphenTag [bar]="2">` compiles clean, same NG8001/NG8002-free result, no schema. So Angular
does not force the `symbiote-` prefix at all on this route; the public capitalized name and the tag
Ivy actually emits can be identical.

**Runtime routing is unaffected either way — checked the vendored source
(`.vendors/angular/packages/core/src/render3/instructions/{element,dom_node_manipulation}.ts`), not
assumed.** A directive-backed element compiles to the classic
`ɵɵelementStart`/`ɵɵproperty`/`ɵɵlistener` triplet; a zero-directive element (today's lowering
output, `dependencies: []`) compiles to the newer `ɵɵdomElementStart`/`ɵɵdomProperty`/
`ɵɵdomListener` fast path. Traced both to the same place:

```
ɵɵdomElementStart  -> createElementNode(lView[RENDERER], name, ns) -> renderer.createElement(...)
classic path        -> the identical lView[RENDERER] renderer, via the directive/component machinery
```

Both read `lView[RENDERER]` — our `RendererFactory2`'s renderer — so neither bypasses it. This also
retroactively confirms the CURRENTLY SHIPPED View/Text lowering (which produces the zero-directive
`ɵɵdomElementStart` shape, see the React-arm section above for the sibling finding on React) is not
relying on anything fragile.

So the honest summary for Angular is: no BUILD-TIME TRANSFORM is needed (case is genuinely not a
rule, unlike Solid/Svelte) — but a RUNTIME DECLARATION is, same shape as declaring any directive
today. Whether that declaration should be a directive (typed props, no schema, works today) or the
existing text-rewriting transform (already shipped, works today, needs no `imports` entry to keep
working since it deletes the dependency entirely) is a real design choice, not yet decided; this
section only closes the open compiler question, not the choice between the two mechanisms.

## The five answers, gathered 2026-09-01 — each adapter measured its OWN, and no two agree

The rename framing was posted to four sessions and came back corrected by two of them. What each
one measured on its own compiler and renderer:

```
react    no transform at all           built and green
vue      compiler option               (pending)
angular  a DIRECTIVE per primitive     a bare tag is NG8001; see below
solid    rename for View/Text ONLY     Pressable and TextInput are not renames
svelte   "bagging", not rename         the prop path decides, not the tag case
```

**Angular — a bare unclaimed tag does NOT compile.** `<symbiote-probe-tag foo="1">` with no matching
component or directive raises NG8001 "not a known element", exit 1, and so does a hyphenless
`<NoHyphenTag>`. `CUSTOM_ELEMENTS_SCHEMA` closes it but is per-app-component boilerplate and only
recognises hyphenated names. The cheap route the Angular session verified instead is **a plain
non-rendering `@Directive({selector: 'symbiote-view'})` carrying `@Input()`/`@Output()` per prop**,
in the primitive's `imports` — closes NG8001 AND NG8002 with no schema anywhere, costs an app
exactly what importing a component costs today, and gives real typed prop checking rather than
"allow anything". A NON-hyphenated selector works there too, so Angular alone is not forced into the
`symbiote-` prefix. Runtime is unaffected either way: a directive-backed element compiles to the
classic `ɵɵelementStart`/`ɵɵproperty` triplet rather than the bare `ɵɵdomElementStart` fast path, and
both resolve through `lView[RENDERER]` to our RendererFactory2 — traced in the vendored source, not
assumed.

**Solid — the four names split three ways, and the middle one fails SILENTLY.**

```
View, Text    rename only. The alias fold and Text's defaults ALREADY run in Solid's renderer
              (foldAliasKey renderer.ts:199, seedTextDefaults, foldTextValue — the last at PATCH
              time too), so a bare tag inherits both and Solid needs no foldHostBag move at all.
Pressable     NOT a rename. specializeStateStyle is a compile-time rewrite with no runtime twin.
TextInput     NOT a rename. Needs the engine-side intrinsicWhen, which nobody has built.
```

The Pressable half is the dangerous one: `resolveStateStyle` is a helper the transforms EMIT, not
something the engine calls. A function `style` on a bare tag is not an `on*` name, so it misses
`setEventListener`, lands in `setProp` as a function, and `fabricProps` drops function props — the
commit carries NO style at all. Same shape Svelte measured for a spread on a stateful primitive.
**So engine-side state-style resolution must land BEFORE any rename, or every
`style={({pressed}) => …}` call site goes blank with nothing red.**

**And Solid's `ref` answer is the exact opposite of Vue's, which is why this fact cannot be shared.**
`IHostInstance` IS the engine node there (`host-instance.ts` re-exports it), so `ref` on a
`symbiote-*` tag assigns the raw `SymbioteNode` and a tag hands back precisely what the wrapper
handed back — the surface does not move. Vue's template ref yields the component instance for a
component and the host node for an element, so the same change moves Vue's surface and not Solid's.
Two correct adapters, opposite answers, one rule — the case
`<prop_types_split_agnostic_vs_per_adapter>` is about, arrived at from the tag side.

Two smaller Solid findings worth carrying: `withStableKeys` is a CAPABILITY the wrapper supplies
(Solid's `spread` has no removal pass, so a shrinking key set leaves stale values on the native view
forever) and a bare tag hands a consumer the raw behaviour; and `ReturnType<typeof View>` becomes
TS2344 (`anchor-flatten-cost.test.tsx:50,64`).

## Vue: the compiler option works on SFC, is DEAD on TSX — and TSX takes React's route instead

Measured 2026-09-01 on both installed pipelines, which is the only way this could have been found:
Vue's two paths do not agree about `isCustomElement`.

```
SFC  @vue/compiler-sfc compileTemplate
     default                             _createBlock(_component_View
     isCustomElement: t=>t==='View'      _createElementBlock("View")

TSX  @vue/babel-plugin-jsx 1.5.0
     import { View } … <View/>           _createVNode(View)     <- the option changes NOTHING
     same + isCustomElement              _createVNode(View)
     NO import + isCustomElement         _createVNode("View")
```

`getTag` checks `path.scope.hasBinding(name)` BEFORE consulting `isCustomElement`, and every real
TSX file imports its primitives — so the option is dead code there, existing only for a spelling
nobody writes. The way through is React's: `h('symbiote-view')` yields shapeFlag ELEMENT with no
component bit, so `export const View: 'symbiote-view' = 'symbiote-view'` makes `_createVNode(View)`
an element vnode with the Babel plugin untouched. **So Vue needs no plugin on either path** — an
option on one, a string constant on the other.

**And that settles whether the engine should accept `"View"` as an alias: it must NOT.** Two
mechanisms mean two tags for one source — SFC emits `"View"`, TSX emits `"symbiote-view"` — so an
engine-side alias makes Vue's own two paths disagree with each other, and their agreement is P0
before either agrees with another adapter. The SFC transformer renames. That reason is stronger than
the "one internal alphabet" preference this file gave earlier, and it is the reason to record.

It is also CHEAPER than today's lowering rename: today the parser has already typed `<View>` as a
component, so `tagType` must be flipped in the same pass or codegen emits slot children an element
path never mounts. With `View` in `isCustomElement` the parser types it ELEMENT up front and the
nodeTransform only rewrites the string. Both paths already build an `isCustomElement` predicate
(SFC in templateOptions, TSX in `babel-jsx.cjs`'s `isSymbioteIntrinsic`) — only the predicate widens.

What treats `View`/`Text` as a component in that adapter: `components.ts`'s `hostComponent()` (which
applies `normalizeVueAttrs` plus Text's `resolveTextProps`) and `create-animated-component.ts:49`.
The second is the easy version of Svelte's blocker — its body already calls `h()`, which takes a
string. **The first is the open question and has no counterpart in any other adapter**:
`normalizeVueAttrs` folds a template's kebab attributes (`:accessibility-label`) to the RN camelCase
contract, and a bare tag has no wrapper to do it in. Whether `foldHostBag` grows to cover it or Vue
keeps its own step is unresolved — note that the spec's `aliases` is a per-primitive LIST while
kebab->camel is a general rule, so it is not a free fit.

## Vue's two adapter-side items are CLOSED, and one of them was already shipped

Both were assigned as work and only one was. Measured 2026-09-01 by comparing the COMMITTED payload
of a wrapper against a bare tag, since Vue's folds are the shape `tests/lowered-primitive-fold-parity.test.ts`
cannot see (that audit's oracle is shared-layer imports, and a fold living in an adapter's own
renderer imports nothing).

**`normalizeVueAttrs` needs no move — the per-key half has been in `patchProp` since SFC lowering
landed.** `normalizeVueAttrKey` folds kebab->camel one key at a time, `PROP_ALIASES` then applies
`id -> nativeID`, and both run before `routeProp`:

```
h(View,            {'accessibility-label':'hi', id:'row-1'})  ->  {accessibilityLabel, nativeID}
h('symbiote-view', {'accessibility-label':'hi', id:'row-1'})  ->  {accessibilityLabel, nativeID}
```

Break-tested: neutering `normalizeVueAttrKey` reddens the tag row. And it must NOT go into
`foldHostBag` — not because the spec's `aliases` is a per-primitive list, but because Vue has FOUR
paths to a node (lowered SFC, lowered TSX, the wrapper, a hand-written `h('symbiote-view', …)`) and
only a runtime fold covers all four. `host-primitives.cjs` already says this about `PROP_ALIASES`.

**Text's defaults come from `seedTextDefaults` in `createElement`, not from `textDefaultFor` in
`patchProp`** — the latter fires only on an explicit `undefined`, so a Text carrying no props never
reaches it. Disabling it leaves the parity test green; disabling the seed empties the tag's payload
while the wrapper keeps its own `resolveTextProps` copy. **Two independent mechanisms that happen to
agree** — when the wrapper is deleted, the seed is the one that must survive. Pinned by
`adapters/vue/src/renderer/tag-fold-parity.test.ts`.

**`createAnimatedComponent` was the signature widening and nothing else.** `Component | string`, plus
`baseName` returning the string (a tag has no `displayName`). `Animated.View` over a tag now commits
its children and folds its props — `animated-tag-base.test.ts`.

### The children branch that looked mandatory and was dead code

Worth the paragraph because the reasoning was right up to the last step. Vue unwraps a slots object
for an ELEMENT by calling `children.default()` and recursing on the RESULT rather than going back
through `h` (`normalizeChildren`, the `shapeFlag & (1 | 64)` branch) — so a slot returning a lone
VNode would be re-read as an object, found to have no `.default`, and dropped silently. A branch
calling the slot ourselves was written and commented against exactly that.

It cannot happen: **Vue wraps every slot at `initSlots`, so `slots.default()` returns an ARRAY
whatever the author's function returned.** Measured both spellings — `() => h(x)` and `() => [h(x)]`
both report `array(1)` inside the wrapper. So `h(Component, reduced, slots)` is correct for a
component base and a tag base alike, and the branch is gone.

The raw-object probe that started it (`h('symbiote-view', {}, {default: () => h(...)})` committing
2 nodes against 4) was measuring a shape Vue's own slots never produce. **A hand-built stand-in for
a framework-normalised value is not the value** — it reproduced a hazard the framework prevents one
layer earlier.

## Vue, item 2: what is LEFT of the transform once the primitive is a tag — nothing it alone can do

Enumerated against `adapters/vue/babel-lower-host-primitives.cjs` (412 lines) and the SFC twin, one
operation at a time, with the engine's new runtime pieces assumed in:

```
lowerableLocalNames    scan imports, map local name -> spec entry   DEAD  the string const IS the import
createHelperImport     inject resolveStateStyle                     DEAD  routeProp resolves at runtime
intrinsicWhenFor       compile-time multiline choice                DEAD  resolveIntrinsicTag, re-made on flip
shadowing check        binding.kind !== 'module'                    DEAD  JS scoping does it (TSX; see below)
expandStateStyles      specialise ({pressed}) => … into a pair      OPTIMISATION, never the mechanism
the rename itself      <View> -> <symbiote-view>                    see §seam — a RENDERER can do it
refusesLowering        spread / ref / state / render-prop child     see §refusals
```

So the answer to "what does the transform still do that no runtime can" is **nothing**, with one
qualification that is about the SFC tag NAME rather than about the transform, and one about
`Pressable` that is about the MODEL rather than about either.

### The seam: no rename needed, because the renderer already has the chokepoint

The two options on the table were "engine accepts the alias `View`" and "the SFC transformer
renames". There is a third, and it is strictly better than both: Vue's renderer resolves every tag
in ONE place, `createElement(type) -> descriptorFor(type)`. Normalising `"View" -> "symbiote-view"`
there keeps the engine seeing one alphabet, keeps both Vue paths agreeing at `createElement`, and
needs no transform at all. `makeDescriptorFor` is a plain record lookup, so the second key is free.

**And the alias-in-the-engine option is worse than "untidy" — it fails silently.** `makeDescriptorFor`
throws only for a `symbiote-`-prefixed miss; anything else falls through to
`{ component: type, isText: false }`. So an unrenamed `"View"` would resolve to a Fabric view
literally named `View`, with no error at any layer and a failure only on device.

### Refusals: five of six die, and the survivor has no fallback left

```
dynamicIntrinsicChoice   DEAD      the choice is runtime now, and re-made on a flip
unreadableAttributeSet   DEAD      it guarded a spread hiding a functional style; routeProp resolves it
instanceBoundDirective   DEAD      measured: a ref already yields the host node from Vue's FUNCTIONAL
                                   View/Text, so tagging moves nothing (adapter-parity-audit.md)
stateInTemplate          DEAD      for a functional `style` — the runtime resolves both values
emitStyleExpressionOnce  DEAD      an output property of a transform that no longer exists
renderPropChild          SURVIVES  and this is the one to read twice
```

`renderPropChild` survives as a CONSTRAINT, not as a refusal — and the difference matters, because a
refusal needs somewhere to fall back TO. Vue's `Pressable` passes press state into the template
through a scoped slot (`v-slot="{ pressed }"`, `slots.default(state)` in `pressable.ts`). A bare tag
cannot: the state lives on the engine node and never crosses back into Vue's reactivity. Today the
transform refuses such a call site and it keeps working AS A COMPONENT. **The tag model deletes the
component, so the fallback goes with it** — a render-prop call site moves from "works, unlowered" to
"cannot be expressed".

That is not an argument against the model; it is an argument that a stateful primitive needs its
fallback decided BEFORE it becomes a tag — a component kept under another name, or the shape
declared unsupported. For `View`/`Text` the question does not arise, because there is nothing to
refuse.

### `unreadableAttributeSet` protects NOTHING on Vue — the hazard it names is already realised upstream

Reproduced before hardening, as `.claude/rules/adapter-parity-audit.md` requires for this category
(its rationale has now been refuted three times). Real pipeline throughout — `compileSfc` on an actual
SFC, evaluated and MOUNTED, press fired through the engine's own listener order; no stand-in props
object, after one of those cost a retraction earlier the same day.

```
<Pressable v-bind="bag" />     bag = { testID, accessibilityLabel, style: ({pressed}) => ({opacity}) }

refusal ON  (shipped)   _createBlock(_unref(Pressable))            resting/pressed: testID, accessibilityLabel
refusal OFF (lowered)   _createElementBlock("symbiote-pressable")  IDENTICAL
```

Byte-identical, resting and pressed. **The refusal changes nothing**, so on Vue it is not standing in
front of a lowering hazard.

**What it IS standing in front of is a live defect on the un-lowered path, and the mechanism is Vue
core rather than anything of ours.** `v-bind="obj"` compiles to
`_normalizeProps(_guardReactiveProps(bag))`, and `normalizeProps` runs `normalizeStyle` on the
`style` key. `normalizeStyle` handles array / string / object and returns `undefined` for a
FUNCTION:

```
normalizeStyle(({pressed}) => ({opacity: pressed ? 0.5 : 1}))  ->  undefined
normalizeStyle({ opacity: 1 })                                 ->  { opacity: 1 }
```

So a functional `style` inside a spread is destroyed before any adapter code runs — today, on the
shipped wrapper path, with no error. Note it does NOT reproduce through `h(Pressable, {...bag})`:
that skips `normalizeProps`, which is exactly why the stand-in arm showed `opacity: 1` and the real
one showed nothing. The prop is a React Native idiom Vue's DOM-shaped normaliser does not know.

**The repair route already exists and is one named export.** The compiled output imports
`normalizeProps` from `@symbiote-native/vue/runtime-helpers`, which is `export * from
'@vue/runtime-core'` plus named overrides (`Teleport`, `vShow`) for exactly this class of problem. A
`normalizeProps` that leaves a function-valued `style` alone fixes the wrapper and the lowered path
in one place. Unbuilt — and scoped only to what was measured: `Pressable`. Whether `<View v-bind>`
carrying a functional style matters is UNMEASURED, though the mechanism is not Pressable-specific.

**The gate question (does this refusal sit behind `observesState` where it cannot run?) does not
bite here**, and it is worth saying why rather than leaving it open: the intrinsic choice — the one
irreversible decision a spread could corrupt — is resolved by `intrinsicWhenFor` in BOTH transforms
BEFORE `observesState` is consulted, and both already refuse outright on a spread. So the stateless
primitive is covered by a different guard that is genuinely reached.

### HALF A on Vue: works on BOTH paths with no compiler option and no transform — measured end to end

Half A keeps the app's import exactly as written and changes only what the symbol IS: a string, not
a component. Probed by compiling a real SFC and a real TSX file against a module whose `View` is
`'symbiote-view'`, then evaluating and MOUNTING each — compile alone would not have answered it.

```
arm                                        emits                              commits
stock SFC (no transform, no option)        _createBlock(_unref(View))         RCTView{testID}
our compileSfc (transform still runs)      _createElementBlock("symbiote-view") RCTView{testID}
TSX (@vue/babel-plugin-jsx, no option)     _createVNode(View)                 RCTView{testID}
```

All three commit the SAME payload, so the answer is yes on both paths, and Vue sits beside React
rather than beside Solid/Svelte for half A.

**Two details the earlier synthetic table got wrong, and they only appear with a REAL import.** The
binding type is `setup-maybe-ref`, not `setup-const` — the compiler cannot see an imported value, so
it cannot know the symbol is constant. That changes the emission: `_createBlock(_unref(View))`, not
`_createBlock($setup["View"])`. `_unref` on a string returns the string, so it is correct, but it is
a call per render at every primitive call site. Anyone quoting the `$setup["View"]` row should note it
came from hand-written `bindingMetadata` and does not describe an import.

**And the lowering transform survives as a pure OPTIMISATION** — same status `expandStateStyles`
already has. Our `compileSfc` arm still fires and emits the static tag, which skips both the `_unref`
call and the runtime element-vs-component decision. Nothing depends on it for correctness any more;
it just prints the better output.

### SUPERSEDED PREMISE: the table above assumes the WRAPPER IS DELETED, and it is not

A constraint from the project owner landed after that table was written: **the consumer API may not
change.** `<Pressable v-slot="{pressed}">` must keep working verbatim; a more verbose equivalent is
a breaking change the initiative does not get to make. So the wrapper survives — not as something an
app names, but as the target a refusing call site is routed to. Read every "DEAD" above as
conditional on wrapper-deletion, which is no longer the plan.

Under the real shape — public name global, transform routes each call site, wrapper as the refusal's
target — most of them come back:

```
renderPropChild          ALIVE   it has a target again; this is the whole reason the transform stays
unreadableAttributeSet   ALIVE   a spread hides whether the call site refuses, and a wrong lower is
                                 now unrecoverable rather than merely unoptimised
instanceBoundDirective   SPLIT   dead for View/Text (functional: a ref already yields the host node)
                                 alive for Pressable/TextInput, which are stateful defineComponents
dynamicIntrinsicChoice   DEAD    resolveIntrinsicTag, re-made on a flip
stateInTemplate          DEAD    for a functional `style`; routeProp resolves both values
emitStyleExpressionOnce  n/a     an output property, never a refusal
```

**And my word "cannot be expressed" was wrong, or rather right about the wrong world.** Press state
does cross back out of a lowered element — `KEY_BY_EVENT` in the pressable behavior dispatches to the
app's `onPress`/`onPressIn`/`onPressOut`, asserted since the behavior existed. What cannot survive on
a bare tag is the SPELLING: a scoped slot handing `pressed` down as a reactive template value. Under
wrapper-deletion that made the call site inexpressible; with the wrapper kept as a refusal target it
is simply un-lowered, which is what it is today.

### Can a transform refuse when `isCustomElement` has already claimed the name? YES on SFC — measured

`isCustomElement` sees only the tag NAME, so it cannot tell a refusing call site from a lowering one.
It does not have to: it is consulted by the PARSER and only sets the default, and a nodeTransform
runs afterwards and can flip `node.tagType` back per node. The transform already does the reverse
flip today (COMPONENT -> ELEMENT), so this is one mechanism in both directions.

```
option only                           plain <View foo>       _createElementBlock("View")
                                      <View v-slot="{…}">    _createElementBlock("View")   <- no refusal possible
option + tagType flip on the slot     <View v-slot="{…}">    _resolveComponent("View") + _createBlock(_component_View)
option + flip + setup-const binding   <View v-slot="{…}">    _createBlock($setup["View"])
```

**The third row is where the price is.** What a refusal resolves TO depends on whether the app has a
binding for the name:

```
app imports View        $setup["View"]           static, tree-shakeable
app imports nothing     _resolveComponent("View")  runtime lookup — needs a GLOBAL registration
```

Global registration is reachable (`mount()` owns the app and already has a `configurator?.(app)`
hook), so "global, no import" and "refusals keep a target" are both satisfiable on SFC. The cost is
precisely what this file already argues against for non-primitives: a global registration is a live
reference, so every app bundles all 12 wrappers whether it refuses anywhere or not.

**TSX inverts, in the helpful direction.** With no import `hasBinding` is false, so `isCustomElement`
fires and the default is already the tag; to refuse, the babel transform emits a reference and can
INJECT the import — which it already does today for the `resolveStateStyle` helper
(`createHelperImport`). Static, and only the wrappers an app actually refuses on get bundled.

So one rule reaches three mechanisms — SFC-with-binding, SFC-global, TSX-injected-import — which is
the two-path drift this file keeps flagging, now compounded. That is the number to weigh, not
whether it is possible.

### Reversibility is ASYMMETRIC between Vue's two paths, and only one of them was measured before

The atomic constraint was attributed to a measurement of mine that I had not made — I had compiled
without `bindingMetadata`. Run properly, with each binding kind the SFC compiler recognises:

```
SFC   no binding,        no option    _resolveComponent("View")
      no binding,        + option     _createElementBlock("View")
      setup-const,       no option    _createBlock($setup["View"])
      setup-const,       + option     _createElementBlock("View")     <- option wins
      setup-ref,         + option     _createElementBlock("View")     <- option wins
      props,             + option     _createElementBlock("View")     <- option wins

TSX   imported primitive              _createVNode(View)
      local `const View`, + option    _createVNode(View)              <- LOCAL wins
      no binding,         + option    _createVNode("View")
```

So the claim is CONFIRMED for SFC and INVERTED for TSX. `isCustomElement` beats every binding kind,
including a local `const View` — the name is taken and an app cannot win it back. On TSX the
primitive is an ordinary import, so a local binding shadows it exactly as in React and Solid, and
adding a name breaks nobody.

**The atomic "all 12 or none" rule therefore survives on Vue, but its reason is not the one recorded.**
It is not "Vue takes the name" — half of Vue does not. It is that the SAME source spelling behaves
differently in an app's `.vue` files and its `.tsx` files, which is the two-path drift this repo
already treats as P0. Quote the asymmetry, not the irreversibility.

### Vue's create seam DOES carry props — measured, because the `intrinsicWhen` verdict rests on it

The `intrinsicWhenFor -> DEAD` line above needs `resolveIntrinsicTag(tag, props)` to be reachable at
CREATE, and our own renderer's `createElement(type)` takes only the type, which makes it look
unreachable. It is not: Vue passes the whole bag and we simply ignore it.

```
runtime-core.cjs.js, mountElement:  hostCreateElement(vnode.type, namespace, props && props.is, props)
RendererOptions:                    createElement(type, namespace?, isCustomizedBuiltIn?, vnodeProps?)
probe, our renderer:                'symbiote-text-input' | 3 extra args | 4th = {multiline:true, value:'x'}
```

So reaching the runtime intrinsic choice at create costs one widened parameter in
`createSymbioteRenderer`, with no framework change and nothing new on the node.

**This does NOT generalise, and the shared spec must not assume it.** Solid's `nodeOps.createElement(tag)`
is tag-only, props arriving afterwards key by key — so `resolveIntrinsicTag` is unreachable at create
there, not merely at update. Vue and Solid look identical from the engine (both "per-key update
seams") and differ at exactly the point this decision needs. Per-adapter fact, per
`<prop_types_split_agnostic_vs_per_adapter>`'s test: a correct adapter could answer differently.

No test pins the Vue half yet, deliberately — nothing consumes the argument, and a test asserting a
framework contract no code depends on is a test about Vue. It belongs in the change that widens the
signature.

### The proof asked for

`adapters/vue/src/renderer/tag-fold-parity.test.ts` — a bare tag mounts and commits a payload
identical to its wrapper's, for `View` (kebab->camel + `id -> nativeID`), `Text` (RN's defaults) and
`Pressable` (compared as a whole committed forest, since keys alone cannot see a shape difference).
Break-tested: neutering `normalizeVueAttrKey` reddens the View row, neutering `seedTextDefaults`
empties the Text tag's payload. Nothing was flipped to a tag to get it.

## Solid, item 2: the transform keeps exactly two jobs — and the CREATE seam has no props either

Measured by the Solid session 2026-09-01, proof in `adapters/solid/src/bare-tag-payload-parity.test.tsx`
(4 cases, bare tag vs wrapper diffed as a sorted key set PLUS every value, break-tested both ways:
disabling `foldAliasKey` reddens row 1 only, disabling `seedTextDefaults` reddens row 3 only).

What survives, and it is not the rename:

```
host-vs-component   `isComponent` is decided by CASE at compile time inside
                    babel-plugin-jsx-dom-expressions. No runtime can undo it. This is the
                    ENTIRE reason Solid keeps a transform.
shadowing           deciding that THIS `View` is our import and not a local binding — a runtime
                    sees a value, the binding is already gone.
```

Everything else is now an optimisation: the `id` rename (the renderer folds it anyway) and the
style specialisation (`routeProp` became the mechanism).

**The find, and it changes the `maybeSwapIntrinsic` brief from a convenience to the only option.**
`nodeOps.createElement(tag)` — that is the whole signature. Solid's renderer builds the element from
the TAG ALONE and props arrive afterwards through `spread` / `setProperty`, one key at a time. So
`resolveIntrinsicTag(tag, props)` is unreachable at CREATE on this seam, not merely at update.
React's create seam hands over `type` AND `props`; Solid's hands over a string.

```
react    createInstance(type, props)      both halves reachable
solid    createElement(tag)               NEITHER half reachable — no props, ever
```

Consequence: an engine-owned `maybeSwapIntrinsic(node, key, value)` beside `routeProp` is the only
shape that works there, and it works precisely BECAUSE it needs no props at create — the node starts
on the base intrinsic and swaps when the deciding prop is written. `dynamicIntrinsicChoice` and
`unreadableAttributeSet` both stand on this seam fact, not on anything the runtime work changed.

**The rename is REVERSIBLE today and MANDATORY after the flip — no half-way state, unlike React.**
An un-renamed `<View>` is currently a component that renders the same tag, which is what makes the
payload proof meaningful. The moment `View` becomes a string const it stops being reversible:
`_$createComponent('symbiote-view', …)` is `untrack(() => Comp(props))`, and a string is not callable.

**And the one guard that does NOT survive the shrink, flagged before it bites.**
`spec-projection-covers-fields.test.ts` keeps working — `SPEC_FIELDS_READ` falls to `['intrinsic']`
and it still reddens on an unread field. What it stops COVERING is `aliases`, `observesState` and
`intrinsicWhen`, which would then be read at RUNTIME by the renderer and the engine, neither of which
has a projection check. The bug class does not go away, it RELOCATES — a spec field dropped between
the file and its reader, which is exactly how `intrinsicWhen` was lost in a whitelist. A shrinking
transform owes that guard a runtime-side twin.

## Two claims of mine that the adapters overturned in one round, and the shape they share

Both were stated to four sessions as fact, in a work brief, and both were one grep from being checked
— the failure `.claude/rules/adapter-parity-audit.md` records as "a claim about ANOTHER adapter is a
claim you have not checked", committed here by the session that had just quoted that rule at everyone.

```
"Solid is the only transform honouring bagFold"     the category was RETIRED 2026-08-31; it exists
                                                    only in comments. Read out of a rule that
                                                    recorded the grid in the present tense.
"isCustomElement beats a setup-const binding,
 so Vue takes the name irreversibly"                MY measurement, attributed to the Vue session.
                                                    True on SFC, INVERTED on TSX.
```

The shared shape is not carelessness, it is SOURCING: both came from prose rather than from a probe,
and neither carried the qualifier that made it true. So when handing another session a fact about
their own adapter, either paste the probe that produced it or label it hearsay — the brief that
carried these did label them, which is the only reason the round cost one correction each instead of
a design built on both.

## Item 2, all five answers in — the model does NOT uniformly delete the wrapper

Measured 2026-09-01, each adapter on its own seam, each with a mounted proof. The premise this
initiative started from — "we are the engine, so we export no components at all, and every lowering
transform dies with the wrapper" — holds for three adapters and is FALSE for two, in opposite ways.

```
react     tag works today, no transform, no build step                    SHIPPED
vue       tag works; rename belongs in the renderer's descriptorFor       transform dies
solid     tag works; rename becomes MANDATORY after the flip              two jobs survive
angular   tag needs a forwarding DIRECTIVE per primitive, not a stub      transform dies
svelte    a bare tag commits NOTHING and THROWS on style                  transform becomes MANDATORY
```

### Svelte inverts optimisation and mechanism

`ShimElement.setAttribute` writes a private `Map` (`dom-shim/element.ts:89`) and never reaches
`routeProp`; the shim has no `.style` at all, so Svelte's `set_style` writing `dom.style.cssText`
throws. Four arms, `p={{…}}` as the live control:

```
wrapper  <View id testID accessible>            { testID, accessible, nativeID: 'ident' }
bag      <symbiote-view p={{…}}>                IDENTICAL
bare     <symbiote-view id testID accessible>   mounts, NOTHING commits
bare + class + style                            THROWS: cannot set 'cssText' of undefined
```

So for four adapters the transform is an optimisation and a missing one costs performance; on Svelte
the bag-building step becomes load-bearing for every app file forever, and a build that skips it
fails SILENTLY on props and LOUDLY on style. **State that wherever the atomic switch is described**
— it is the one place where "lowered and un-lowered call sites are indistinguishable to an app",
the property that makes lowering an optimisation everywhere else, stops being true.

Anchors, which was the expected difference and is not one: both tag forms are ELEMENTS, so a bare
tag sheds anchors exactly as the lowered element does (component-calls 2 / 0 / 0 for
component / bag / bare inside an `{#each}`). The bag is not what buys that.

### Angular: `[style]` is a RESERVED binding, and an `@Input()`-only directive does nothing

Two findings that make the directive route cost more than "declare the tag":

```
<symbiote-pressable [style]="fn">  no directive   Error: Unsupported styling type: function
                                                  (Ivy's own checkStylingMap / toStylingKeyValueArray)
```

**CORRECTED under real AOT — the first reading of this was a JIT artifact and it understated the
constraint.** `[style]` compiles to `ɵɵstyleMap` ALWAYS, whatever any matched component or directive
declares as `@Input()`. Four constructs compiled through ngc + linker, including production's own
`<Pressable [style]="fn">` with the real package import: every one emits `ɵɵstyleMap(ctx.…)`. Nothing
reclaims the binding; that path does not exist in Angular's compiler.

Our Pressable works for a different reason, verified in our own source: `pressable/index.ts:310`
exposes `resolvedStyle` as a TypeScript GETTER — `isStyleFn(this.style) ? this.style(state) :
this.style` — and line 382 binds the RESULT to the inner intrinsic. The function is unwrapped in
code, never in a template expression.

**CORRECTED AGAIN — and this passage's history is the lesson.** The paragraph above read the AOT
output as TEXT and concluded a function throws. Executed through the real linked artifact, it does
not: `ɵɵstyleMap` is always the compiled instruction, but it is not the final word. Angular's runtime
checks `hasStylingInputShadow` FIRST (`.vendors/angular/packages/core/src/render3/instructions/
styling.ts:259`) and, when a matched directive declares `@Input('style')`, redirects the value
straight to that input via `setDirectiveInputsWhichShadowsStyling` — `toStylingKeyValueArray`, the
function-rejecting code, is never reached. Angular's own source names the scenario:
`// Given <div [style] my-dir> such that my-dir has @Input('style'). This takes over the [style]
binding.`

So the directive IS Angular's sanctioned mechanism and it works. It does not even need the resolving
getter our Pressable uses: forwarding the RAW value is enough, because `routeProp`'s
`isStyleCallback` resolves it downstream. Measured at both press states (resting 1, pressed 0.2),
matching the wrapped component.

Three readings of one construct in one day — `@Input()` reclaims it (JIT, wrong), nothing reclaims it
(compiled text, wrong), the runtime redirects it (executed, right). **Compiled text is not compiled
behaviour**, and an instruction name is not a verdict about what the instruction does.

And the directive is not a stub — `@Input()` only writes onto the directive instance; nothing
forwards it. It needs `ngOnChanges() { renderer.setProperty(el.nativeElement, 'style', this.style) }`
per input, in real running code, once per primitive.

`CUSTOM_ELEMENTS_SCHEMA` priced against it with real compiles, and its blast radius is narrower than
guessed but wrong in the places that matter:

```
<Veiw>                              NG8001 either way — the schema does not hide a capitalized typo
<symbiote-vieww>                    schema: clean compile, SILENT
<symbiote-view [totallyBogusProp]>  schema: clean compile, SILENT
```

Take the directive. Reversible if the exported CLASS NAME is stable — an app writes
`imports: [Pressable]` either way and only what `Pressable` IS changes — but symmetric in effort in
both directions, not "delete a component, add a one-liner".

## A refusal only exists while a transform does — the law two adapters found from opposite sides

The sharpest result of the round, and it retires the question "which refusals survive" as
badly posed. Every `REFUSAL_CATEGORIES` entry needs a verdict of the form **converts to X**, decided
BEFORE the flip.

```
vue      deleting the COMPONENT removes the refusal's TARGET
         `renderPropChild`: today a `v-slot="{pressed}"` Pressable refuses and keeps working AS A
         COMPONENT. The tag model deletes the component, so the call site goes from
         "works, unlowered" to "cannot be expressed".
svelte   making the TAG PUBLIC removes the refusal's OPPORTUNITY
         an app writes `<symbiote-view bind:this={el}>` directly; there is no transform in front of
         it to decline anything, so spread / bind: / use: stop being refusable and become the tag's
         permanent semantics.
angular  the same from a third side, stated plainly: "there is no transform in this route to
         decline anything."
```

### CORRECTION, measured the same hour: "cannot be expressed" is FALSE — the state already crosses back

The paragraph above was first written as a precondition on the whole initiative ("a stateful
primitive needs a fallback decided before it becomes a tag, or the call site becomes inexpressible").
That was a peer's word relayed without probing the engine, which is the relaying session's OWN layer,
and it is wrong. `pressed` was deliberately moved into the engine — style/activeStyle is built on it —
and the outward channel moved with it. Probed on a LOWERED element, app listeners installed exactly
as an app would install them on a bare tag:

```
APP LISTENERS FIRED:            ["in","out"]        <- the app's own onPressIn / onPressOut ran
STYLE SLOT before/during/after: [{opacity:1},{opacity:0.5},{opacity:1}]
```

`core/components/src/behaviors/pressable.ts`'s `KEY_BY_EVENT` maps the engine events to
`onPress` / `onPressIn` / `onPressOut` / the responder names and `dispatch` calls the app's listener,
on the lowered path. So the bare-tag equivalent of `v-slot="{pressed}"` is ordinary event wiring —
`@press-in="pressed = true" @press-out="pressed = false"` — expressible in every adapter's own idiom.

**What actually changes is the SPELLING, not the capability.** A scoped slot handing `pressed` down
implicitly disappears; the same screen is written with two listeners and one piece of local state.
That is an API regression worth deciding on deliberately — it is more verbose and it moves state the
framework used to own back into app code — but it is not a blocker, and nothing needs a fallback
component.

**And the evidence was already in the repo.** `pressable.test.ts:107-116` has asserted an app
`onPressIn` firing through the behavior since the behavior existed. The claim was refuted by a test
that predates it. So the failure was not a missing measurement, it was reaching for a peer's
conclusion instead of the file — `.claude/rules/verify-the-deciding-side.md`, committed by the
session that had quoted that rule at four others in the same round.

## A create seam's SIGNATURE does not tell you whether props are reachable — it lied in both directions

Two adapters look identical from the engine and differ exactly where this decision needs them:

```
solid   nodeOps.createElement(tag)              genuinely tag-only; props arrive per key, later
vue     createSymbioteRenderer.createElement(type)   looks tag-only — but Vue's mountElement calls
        hostCreateElement(vnode.type, namespace, props && props.is, props) and our renderer simply
        ignores the 4th argument. Runtime probe: 'symbiote-text-input' + 3 extra args, 4th =
        {multiline: true, value: 'x'}
```

So `resolveIntrinsicTag(tag, props)` at create costs Vue one widened parameter and is unreachable on
Solid in principle. Anyone reading a seam table would group the two together and be wrong about one
— which is `<prop_types_split_agnostic_vs_per_adapter>`'s test applied to a SEAM: a correct adapter
could answer differently, so it is a per-adapter fact and must never become a spec assumption.

`maybeSwapIntrinsic(node, key, value)` remains the only shape that works everywhere, precisely
because it needs no props at create.

Note the discipline on the Vue side: no test was added pinning that 4th argument, because nothing
consumes it yet and a test asserting a framework contract no code depends on is a test about Vue
rather than about us. It belongs in the change that widens the signature, break-tested by dropping
the parameter.

## THE CONSTRAINT that governs all of the above: the consumer API may not change

Stated by the project owner 2026-09-01, after the round above proposed replacing a scoped-slot
`Pressable` with explicit `@press-in` / `@press-out` wiring: **an app's spelling must not change, and
a developer who writes the RN idiom is right to.** A more verbose equivalent that works is still a
breaking change, and this initiative does not get to make one.

That retires "the tag model deletes the wrapper" as the initiative's shape. The reconciliation, and
it is REASONING not measurement — the four adapters are pricing it:

```
public name    global, no import                      <- what the initiative is actually for
transform      routes each CALL SITE: tag or component
wrapper        survives as the refusal's TARGET; an app never names it directly
```

Read that against Svelte's law two sections up and it inverts the conclusion rather than
contradicting it. "A refusal only exists while a transform does" is exactly right — so the transform
STAYS, and it stays for this. A refusal is not a limitation to be removed; it is the mechanism that
keeps a lowered and an un-lowered call site indistinguishable to an app, which is the property the
whole lowering design already rests on.

Consequence: the "transform dies" verdicts from Vue and Angular are answers to a different question
than the one that now matters. What each adapter needs to price is not "can the transform go" but
**"can the transform still route a refusing call site to a component under a name the app never
writes"** — and in Vue and Angular the name is taken by the tag, which is where the difficulty
actually sits.

## The initiative is TWO halves with wildly different costs, and only one of them was ever measured

Two adapters priced the constrained model independently, by different mechanisms, and converged on
the same split. It is the most decision-relevant result of the day.

```
half A   the primitive RESOLVES TO A TAG, imported as it always was
         `import { View } from '@symbiote-native/react'` where View === 'symbiote-view'
         SHIPPED on React 2026-09-01, measured at parity with stock. No cost found anywhere.

half B   the NAME is GLOBAL — no import at all
         built nowhere. Every cost this initiative has surfaced belongs to this half.
```

The costs of half B, found separately and neither predicted:

```
solid   the IMPORT is the evidence that this `View` is ours — `LOWERABLE` is keyed on imported
        names. Remove it and the transform must treat any capitalized `View` that is not locally
        bound as ours. The failure mode of that widening is rewriting SOMEBODY ELSE'S component,
        and unlike a missed call site it is silent.
vue     a global registration is a LIVE REFERENCE, so a refusing call site resolves through
        `_resolveComponent("View")` and every app bundles all 12 wrappers whether it refuses
        anywhere or not. With an import it is `$setup["View"]` — static and tree-shakeable.
```

And a third argument that needs no adapter: **an RN developer today writes
`import { View } from 'react-native'`.** Under the owner's own "the consumer API may not change"
constraint, the import IS the current API — so half B is itself an idiom change, and the one half
that is not.

Solid's summary is the one to quote: *if the public name stayed an ordinary import while resolving
to a string, the evidence survives, the transform stays narrow, and everything except the inversion
goes away.*

### The inversion, which half B causes and half A does not

```
today   a refusal is a NO-OP — leave `<View>` alone and it is still a component rendering the right
        tag. "When unsure, do nothing" is correct; a missed call site costs an optimisation.
half B  doing nothing emits `_$createComponent('symbiote-view', …)` and a string is not callable.
        Every call site must be rewritten; "unsure" must route to the component.
```

That is a different KIND of transform from the one the plan called a rename — output optional
becomes output load-bearing for every call site in the app. The failure is at least LOUD
(`TypeError: Comp is not a function` at first render), unlike the silent `descriptorFor`
fall-through, which is what makes "rewrite every site" tolerable at all.

### Vue can refuse per call site — measured, and the price is bundling not compilation

`isCustomElement` is consulted by the PARSER and only sets a default; a `nodeTransform` runs after
and flips `node.tagType` per node, which Vue's transform already does in the other direction.

```
option only                        <View v-slot="{…}">   _createElementBlock("View")   no refusal possible
option + tagType flip              <View v-slot="{…}">   _resolveComponent("View")     works
option + flip + a setup binding    <View v-slot="{…}">   _createBlock($setup["View"])  works, static
```

So no collision — but one rule now reaches THREE mechanisms (SFC-with-binding, SFC-global,
TSX-injected-import) that must agree on every call site, in a layer where a disagreement is a button
that renders and does not respond.

### The refusal table, re-read against the constrained model

Vue's, and it reverses most of the wrapper-deletion answers because a refusal has a target again:

```
renderPropChild          ALIVE   the reason the transform stays
unreadableAttributeSet   ALIVE   a spread hides WHETHER a call site refuses, and a wrong lower is
                                 now unrecoverable rather than merely unoptimised
instanceBoundDirective   SPLIT   dead for View/Text (functional), alive for Pressable/TextInput
dynamicIntrinsicChoice   DEAD    resolveIntrinsicTag, re-made on a flip
stateInTemplate          DEAD    for a functional style; routeProp resolves both values
```

`unreadableAttributeSet` is the one to flag: under the old shape a missed refusal cost an
optimisation; under this one it silently ships the wrong behaviour, and `v-bind="obj"` on a stateful
primitive is a common spelling.

## HALF A IS THE PLAN — the per-adapter cost, measured on all five (2026-09-01)

Half B (the global name) is SKIPPED. With the import kept, the cost of half A is:

```
react     nothing. Shipped, measured at parity with stock.
vue       nothing — no compiler option, no transform, on BOTH paths. Measured end to end.
solid     the transform it already has (babel decides host-vs-component by CASE)
svelte    the transform it already has (case, plus the p={{…}} bag it needs for correctness)
angular   the transform it already has (a raw function can never reach [style]; never optional)
```

Nobody has to build a new mechanism. The three adapters that keep a transform are keeping the one
already on disk, for reasons that predate this initiative.

Vue's arms, against a module whose `View` is the string `'symbiote-view'`:

```
stock SFC, no transform, no option       _createBlock(_unref(View))            RCTView{testID}
our compileSfc, transform still runs     _createElementBlock("symbiote-view")  RCTView{testID}
TSX, @vue/babel-plugin-jsx, no option    _createVNode(View)                    RCTView{testID}
```

Identical payload in all three, so **on Vue the lowering transform becomes a pure OPTIMISATION** —
it skips the `_unref` call and the runtime element-vs-component decision, and nothing depends on it
for correctness once the symbol is a string. Same status `expandStateStyles` already has.

And the three-mechanism problem recorded above **evaporates with half B**. It existed because a
refusal had no binding to resolve to: SFC needed a global registration, TSX an injected import. With
the import kept both paths already have the binding, and a refusal is just "do not rewrite" — one
mechanism, the one both transforms implement today.

### A real import is `setup-maybe-ref`, not `setup-const`

The compiler cannot see an imported VALUE, so it cannot know the symbol is constant. Emission is
`_createBlock(_unref(View))` — correct (`_unref` on a string returns the string) at the cost of one
call per render per call site, which is exactly what the transform removes. **The `$setup["View"]`
row in the earlier Vue table came from hand-written `bindingMetadata` and does not describe an
import** — do not quote it for half A.

## Does the FRAMEWORK have its own door? — asked 2026-09-01, and it was the right question

Every earlier round asked "can our transform go away". The owner's objection reframed it:
host-vs-component is the framework's job, refined over a decade, so a build step of ours making that
decision is a sign of bad integration rather than of a missing capability. This project has the same
mistake on record twice — the CSS parser before lightningcss, the 36 hand-rolled RN ports.

Asked properly, three of the five "we need a plugin" answers were wrong or overstated:

```
react     never had one
vue       needs none — a string-valued import IS an element on both paths
angular   Angular's OWN mechanism works. `hasStylingInputShadow` redirects [style] to a matched
          directive's @Input('style'); the transform collapses to ONE binary check per occurrence
solid     NO DOOR. `isComponent(tagName)` is hardcoded, byte-identical across versions and upstream
svelte    THE DOOR IS OURS TO OPEN — `<svelte:element>` is sanctioned; our DOM shim does not
          implement the contract it calls
```

### Solid: the allowlist exists and sits one line after the decision

```js
function isComponent(tagName) {
  return (tagName[0] && tagName[0].toLowerCase() !== tagName[0]) ||
    tagName.includes(".") || /[^a-zA-Z]/.test(tagName[0]);
}
if (isComponent(tagName)) return transformComponent(path);            // decides
const tagRenderer = (config.renderers ?? []).find(r => r.elements.includes(tagName));
```

`renderers[].elements` is the only option naming tags as elements and is reached only for a name that
already failed the capital test — it selects WHICH renderer handles an element, it cannot make
something one. Undocumented. Byte-identical in 0.40.7, 0.40.10 and upstream main, so this is the
current design, not a version we are behind on. Every other option was checked and none is a door
(`builtIns` auto-imports Solid's own capitalized components — the opposite direction;
`contextToCustomElements` runs after the decision).

A genuine upstream gap, and NOT a two-line fix: the predicate is called from six places and only one
is the dispatch; the other five make static/dynamic decisions about the tree, so flipping only the
dispatch leaves five sites believing the name is a component. Nothing has been filed — an upstream
issue crosses the machine boundary and needs the owner's say-so.

### Svelte: the lock is on our side, and that is our integration debt

`<svelte:element this="symbiote-view" p={{…}}>` commits NOTHING while a literal `<symbiote-view
p={{…}}>` commits correctly in the same run. The two take different code paths:

```
<symbiote-view p={…}>       set_custom_element_data(node, 'p', bag)   property set — works
<svelte:element this=…>     $.element(…) + attribute_effect           a different decision procedure
```

`attribute_effect` -> `set_attributes` -> `get_setters`, whose stop condition is `Element.prototype`.
On a real ShimElement: no `Element` global at all, `Element.prototype` not in the chain, no `.style`
object (hence the `cssText` throw), and `p` IS a setter on the chain — so a walk with a valid stop
would find it. **We never installed the doorframe.** Confidence is calibrated: the preconditions were
proved absent and nothing lands; `get_setters` was not single-stepped. The spike that would settle it
installs an `Element` global plus a minimal `style` object and re-runs the arms.

Do not file upstream. Svelte's API is there and we implemented half the surface it calls.

**But note what it would and would not buy.** `svelte:element` does not preserve the SPELLING — an app
writes `<View>`, not `<svelte:element this={View}>`. So the door removes the need for the shim's bag,
never the need for something that turns `<View>` into a host element.

## What keeping the transforms COSTS — priced 2026-09-01, and the decisive number is app-side

```
adapter   what the app ALREADY must configure          lowering rides in      extra app lines
react     a Metro transformer, for CSS only            — (no transform)             —
solid     babel-preset-solid, or JSX does not compile  inside our preset             0
vue       a Metro transformer for .vue                 inside it                     0
svelte    a Metro transformer for .svelte              inside the preprocessor       0
angular   babel + the linker, or AOT does not work     its own plugin entry          1
```

**No app configures "a lowering transform".** It configures its own framework's compiler, which is
mandatory regardless, and the lowering rides inside it. Only Angular adds a visible line, into a
config that already has three entries. That is the number that decides A, and it was not where this
was being argued.

Our own side, today:

```
transforms   solid 498 · vue 412 + 791 · svelte 512 · angular 504          2717
shared       host-primitives 269 · lowering-fixtures 207 · specialize 219   695
tests        solid 14 · vue 8 · svelte 8 · angular 4 · react 1         35 files
```

That prices TODAY's model, not half A — and half A is what shrinks it, because the behaviour has
already moved into the engine. Measured on Solid rather than estimated: **184 of 499 lines and 134 of
270 CODE lines go outright** (the state-style core, the `resolveStateStyle` import, `isFunctionStyle`,
`renameAliasedAttributes`), leaving ~300 lines / ~135 code lines that are mostly comment-dense
rationale.

**Do not carry Angular's "one binary check" across to the other adapters.** Solid keeps routing plus
three refusals that have no runtime half — `ref` (would change the surface on Pressable and
TextInput), `renderPropChild` (a function child taking press state is not a host child under any
runtime), `dynamicIntrinsicChoice` (blocked by its create seam having no props, not by the engine) —
plus the shadowing scan. The adapters differ here and a single figure would flatter three of them.

### Solid's gate is generator-agnostic by construction — verdict closed

```js
function transformElement(config, path, info = {}) {
  if (isComponent(tagName)) return transformComponent(path);   // FIRST statement
  const tagRenderer = (config.renderers ?? []).find(...);      // only names that failed the check
  ... generate === "dom" ? DOM : generate === "ssr" ? SSR : universal
}
```

One entry point; the check runs four lines before a generator is chosen. The universal branch reads
exactly three config keys in the whole region (`hydratable`, `wrapConditionals`, `effectWrapper`),
none about tags, and `babel-preset-solid` adds nothing universal-specific.

So the finding, in its sharpest and now measured form: **the mode that exists for a non-DOM host
gives that host no way to name its own elements**, while the plugin's one tag-naming option
(`renderers[].elements`) sits behind the capital check.

Only 2 of the 6 `isComponent` call sites are reachable on the universal path (the dispatch plus
`getStaticExpression`); the other four are DOM- and SSR-only. That does not shrink a correct upstream
PR — a config-aware `isComponent` must stay right for all three generators — but it concentrates the
risk in generators we do not use, which is a better thing to be able to say. The earlier
"six call sites, three files" figure sizes the change for UPSTREAM, not for our case.

### Why the transform is not a usurpation on Solid

```
RN says      the primitive is named `View`     a convention older than us
Solid says   capitalized means component       a convention older than us
```

Neither is ours to change, and in a browser they never collide because host elements are lowercase.
The transform reconciles two upstream conventions — an integration job, not a takeover. What made the
old model fragile was that the transform carried BEHAVIOUR; under half A it carries routing, and a
miss on Solid is a loud `TypeError: Comp is not a function` at first render rather than a silent
change of behaviour.

## A compile-time split can cost MORE than the runtime resolution it replaces

Measured on Solid 2026-09-01, and it inverts the assumption the removal was ordered under — mine,
given to two sessions before either measured it. "Removing the state-style split moves work from
build time into the commit path" sounds obviously true and is false:

```
split      TWO writes per node — `style` and `activeStyle`, two trips through routeProp,
           two pushClassStyle publishes
callback   ONE write that fills both slots in a single pass
```

The same two objects are allocated either way. The difference is the second write, and **a write
count does not change on a device** — which is why this transfers where a headless millisecond
would not. 10 000 styled nodes, three runs, `createNode` / `appendChild` / `completeRoot`
byte-identical and the committed payload asserted identical in both arms:

```
run 1   split 12.9/15.6   hoisted 10.9/11.2   callback 11.6/12.5   (min/median ms)
run 2   split 13.9/16.1   hoisted 11.3/11.5   callback 11.1/12.9
run 3   split 12.5/15.3   —                   callback 11.9/12.3
```

**The third arm is what makes it a mechanism rather than a measurement.** `split-hoisted` shares
both style objects, so it pays no allocation at all — the optimistic bound for the split IF the
compiler hoists the pair out of the render. The installed Solid preset does not:

```
<symbiote-pressable style={{opacity:1}} activeStyle={{opacity:0.6}} />
->  _$setProp(_el$, "style", { opacity: 1 });
    _$setProp(_el$, "activeStyle", { opacity: 0.6 });
```

Two inline literals inside the element factory, constructed per element. So `hoisted` prices an
optimisation nobody has written, and `split` is the realistic arm.

Whether **Vue** answers the same way is open, and it is the one place the adapters can legitimately
diverge: a static `style` + `activeStyle` pair may be hoisted into a `_hoisted_N` constant on the
SFC path, which would put Vue's split arm nearer Solid's `hoisted` column than its `split` column.

**The general form, because this project keeps meeting it from both sides: moving work to compile
time is not free, and the price is usually paid in the SHAPE of what the compiler emits.** Count the
writes the emission produces before assuming a build-time rewrite is cheaper than a runtime one.

### And the fragility meter that makes this checkable

`tests/lowering-transform-carries-no-behaviour.test.ts` asserts no lowering transform BINDS a
payload-changing module (`specialize-state-style`, `fold-host-bag`, `resolve-intrinsic`), with an
equality-compared `CARRIES_BEHAVIOUR` allowlist so it fails in both directions. `host-primitives` is
deliberately not on the denylist — it is a table of tag names, and reading it is the routing a
transform is allowed to do.

**The distinction the test turns on, and it would be wrong without it: EMITTING an import into the
output is delegating to the runtime and is fine; CALLING the module at build time is not.** Svelte
prints `import { resolveStateStyle } from '@symbiote-native/svelte/state-style'` into the compiled
file; Solid called `specializeStateStyle(expression, types)` and rewrote the author's expression.
Only a real require/import binding is a finding, and a third row pins that so the next person
tightening the regex does not break Svelte believing they closed a gap.

## The four blockers, and where they stand (2026-09-01)

### 1. Engine-side state-style resolution — DONE

`routeProp`'s `style` branch now accepts a FUNCTION and resolves it at both values of `pressed`
(`core/engine/src/node.ts`, `isStyleCallback`). Before this, a functional `style` on a bare tag
committed NO style at all: a function is not an `on*` name, so it misses `setEventListener`, lands
in `setProp` as a function value, and `fabricProps` drops function props. Silent and total; traced
by the Solid session.

So `specializeStateStyle` is now an OPTIMIZATION and this is the mechanism — the same relationship
`foldHostBag` has with the compile-time prop folds. **Nothing may rename a primitive to a bare tag
before this is in a build that adapter is measured against.**

The slot needed one new field, and the reason is worth keeping: `activeStyleFromCallback`
distinguishes a variant WE derived from one a transform wrote as an explicit `activeStyle` prop.
`style` switching from a callback to a plain value must clear the first and must NOT clear the
second — a transform writes the two as independent props in an unspecified order, so a plain `style`
write arriving second would otherwise wipe the pressed look.

Covered by `core/engine/src/__tests__/runtime-state-style.test.ts` (7 cases). Break-tested: disabling
the branch reddens 5 of 7, and the 2 survivors are exactly the plain-value rows, which is the
correct signature.

### 2. Runtime intrinsic choice — DONE

`resolveIntrinsicTag(tag, props)` in `core/components/src/resolve-intrinsic.ts` (subpath
`./resolve-intrinsic`), wired into React's `createInstance`. `descriptorFor(resolveIntrinsicTag(type,
props))` is identity for every primitive that declares no alternative, so a renderer calls it
unconditionally.

Three details that are not obvious and were each a deliberate choice:

- **The check is `=== true || === 'true'`, not truthiness.** A template adapter can deliver
  `multiline="true"` as an attribute STRING, and truthiness would then read `multiline="false"` —
  also a non-empty string — as multiline, committing the wrong native view uncorrectably.
- **A tag that is already the alternative resolves to ITSELF.** It arrives that way from a transform
  that made the choice; re-resolving it against props that may not carry `multiline` would send a
  multiline input back to the single-line view.
- **A later flip of the prop does NOT re-create the node.** No prop write moves a node between
  native views, so a runtime flip keeps the view it was created with until a renderer implements
  re-creation — the same thing a browser does on an `<input type>` change. Documented in the module
  rather than left to be discovered.

Covered by `core/components/src/__tests__/resolve-intrinsic.test.ts` (9 cases), including a CONTROL
asserting `HOST_PRIMITIVES.TextInput.intrinsicWhen` still exists — with the entry withheld, every row
reports "resolves to the base tag", which is the true answer for a primitive with no alternative and
a false green for the rule under test. Two break-tests, and they redden DIFFERENT rows: a truthy
implementation fails only the `"false"` row, a disabled resolver fails the two positive ones.

### 3. `Animated.*` — closed on three adapters, by three different answers

```
react   widened to ComponentType<P> | string          createElement takes a string
solid   a typeof-string branch: createElement + spread   DONE by that session
svelte  NOT a blocker — see below
vue     nearly free; its body already calls h()       theirs to do
```

**Solid's is cheaper than budgeted and its shape is the one to copy.** `spreadExpression` in
solid-js/universal skips `children` and `ref` in its prop loop and drives both through their own
render effects, so ONE `spread` covers props, ref and children — the same pair solid-js/web's own
`Dynamic` makes on its string branch. No `insert`, no ref threading. Two details that cost time: the
`typeof` check must sit INSIDE the returned component (`Base` is captured by a nested function, so
narrowing around the factory does not reach the JSX), and `createElement` is typed over a node union
that includes the SURFACE, so the return needs a guard rather than a cast — thrown, not defaulted to
null, because a null return there paints nothing and stays green.

**Svelte's is not a blocker at all, and the check was the IMPORTER rather than the signature.**
`modules/animated/index.ts:44-45` imports the bases by PATH (`../../components/View.svelte`), not
through the barrel — so when the barrel's `View` becomes the string tag, `createAnimatedComponent`
keeps working unchanged, provided `View.svelte` stays on disk as a private module. That is the shape
the design already asks for: the node reaches the wrapper through an `{@attach}` that every Symbiote
component forwards onto its host tag, and a bare tag has no forwarder.

The price, stated so nobody rediscovers it: one component instance per `Animated.View` — 13 canary
call sites plus `touchable-opacity/index.svelte:26` and `scroll-view/sticky-header.svelte:63`, i.e.
every TouchableOpacity and every sticky header. It is OFF the benchmark row entirely (that row uses
Pressable), so the anchor win came from the row, not from Animated.

Two routes measured and NOT taken there, recorded so they are not re-derived: an `AnimatedHost.svelte`
is ruled out by an existing constraint — that file is deliberately plain TS with no `.svelte` import,
because a `.ts` importing one is unparseable without the Svelte plugin, which includes this repo's
vitest and `packages/navigation`'s drawer smoke tests. And `<svelte:element this={tag} p={bag}>` is a
DIFFERENT code path from a literal tag: it compiles to `$.element(...)` + `attribute_effect`, which
detects a custom element at runtime via `element.nodeName.includes('-')` (attributes.js:578) and picks
property-vs-attribute through `get_setters`, walking the prototype chain to `Element.prototype`
(:588). The shim would have to satisfy that walk; nobody has measured whether it does.

### 4. `normalizeVueAttrs` — CLOSED, and it needed no work

It was already in `patchProp` and had been since SFC lowering landed: `normalizeVueAttrKey` folds
kebab->camel one key at a time and `PROP_ALIASES` applies `id -> nativeID`, both before `routeProp`.
Measured on the committed payload of both shapes, break-tested:

```
h(View,            {'accessibility-label':'hi', id:'row-1'})  ->  {accessibilityLabel, nativeID}
h('symbiote-view', {'accessibility-label':'hi', id:'row-1'})  ->  {accessibilityLabel, nativeID}
```

**And the reason it stays Vue's is not the one this file first gave.** "The spec's `aliases` is a
per-primitive list while kebab->camel is a general rule" is true and not load-bearing. The real
reason is that Vue has FOUR paths to a node — lowered SFC, lowered TSX, wrapper, hand-written `h()` —
and only a runtime fold covers all four. `host-primitives.cjs` already says exactly that about
`PROP_ALIASES`.

Method note worth more than the outcome: this had to be measured on the payload rather than read out
of the source, because a renderer-side fold is invisible to `tests/lowered-primitive-fold-parity.test.ts`
— that audit's oracle is shared-layer IMPORTS, and a fold that imports nothing produces no evidence
either way.

**One finding from the same measurement that matters for the wrapper deletion.** Vue's Text defaults
do NOT come from `textDefaultFor` in `patchProp` — that fires only on an explicit `undefined`, so a
`Text` with no props never reaches it. They come from `seedTextDefaults` in `createElement`.
Disabling `textDefaultFor` leaves the parity test green; disabling the seed empties the TAG's payload
while the WRAPPER keeps its own `resolveTextProps` copy. Two independent mechanisms that happen to
agree — so when the wrapper goes, the SEED is the one that must survive, because `resolveTextProps`
leaves with `components.ts`. Pinned by `adapters/vue/src/renderer/tag-fold-parity.test.ts`.

### A duplication this surfaced, harmless today

`foldHostBag` has ZERO callers in `adapters/angular`. Angular hand-rolls the same formula in
`renderer/index.ts:69-92` — `seedTextDefaults` writes the defaults at `createElement`, `textDefaultFor`
recovers one when a later write clears the key. Checked against the spec: the same two keys and the
same two values, no drift, and both compute `authored ?? 'tail'` / `authored !== false`, so a future
tag pipeline calling `foldHostBag` there could only ever confirm the seed. But that makes THREE
independent implementations of one fold (React and Svelte via the shared module, Angular its own) —
exactly the shape `fold-host-bag.ts`'s header says the module exists to prevent.

### 5. Node re-creation on an intrinsic-deciding prop change — DONE

The fifth blocker, surfaced by Solid after the first four closed: `resolveIntrinsicTag` chose the
view at CREATE and nothing re-chose it, so a runtime `multiline` flip kept the view chosen first —
the wrong native view, uncorrectable, nothing red. That is why Solid deliberately KEPT
`dynamicIntrinsicChoice` as a refusal even after the runtime choice landed.

**The mechanism already existed and only needed a door.** `commit.ts`'s walk re-creates any node
whose `viewName` no longer matches its committed one — that is how a `<Text>` moving in or out of
another `<Text>` flips between RCTText and RCTVirtualText, and the debug reason is literally
`view-kind`. So the whole fix is `setNodeComponent(node, component)` in the engine: assign, mark
dirty, let the existing branch do the rest. No new commit path, no subtree bookkeeping — children
re-parent because their committed parent changed, which the same branch already handles.

**Identity survives, and that is the design rather than a detail.** The engine node is the SAME
object across the swap, so an app's ref, the host behavior bound at create, and the children all
stay attached while the native side is rebuilt underneath. It is the browser's own semantics for
`<input type>`: the element survives, its internal representation does not. The earlier note in
this file that a flip "needs the node re-created, exactly as a browser re-initialises" was right
about the native half and would have been wrong if read as replacing the JS object.

Policy stays out of the engine, as everywhere else here: which prop decides and which views it
decides between live in `HOST_PRIMITIVES`, read by `resolveIntrinsicTag`; the engine only knows how
to swap a name. React's `commitUpdate` calls it unconditionally —
`setNodeComponent(node, descriptorFor(resolveIntrinsicTag(type, newProps)).component)` — which is
safe because the function is a no-op on an unchanged name.

**That call site is REACT-ONLY as written, and reading it as "the shape to copy" was wrong.** Only
React's update seam is handed the tag and the whole props bag; the other four are per-key:

```
react     commitUpdate(instance, TYPE, oldProps, newProps)    tag + props, handed back
solid     setProperty(node, name, value)                      one key, no tag
vue       patchProp(el, key, prev, next)                      one key, no tag
svelte    one flat bag through routeProp, key by key          one key, no tag
angular   setProperty(el, name, value)                        one key, no tag
```

`node.props` is current by then, so the props half is fine everywhere. **The TAG is the missing
half, and it cannot be recovered from the node**: `createElement` takes the tag and deliberately
does not keep it ("Nothing is stored — the lookup happens once"), and inverting `node.component`
back to a tag is impossible because the map is not injective — `symbiote-text-input` and
`symbiote-text-input-managed` both resolve to `RCTSinglelineTextInputView`. Gating on the component
family alone would also fire on `-managed` nodes, where the wrapper emits the other tag itself.

**The shape that won is a THIRD one, proposed by the Solid session: hand adapters the DECISION, not
the data.**

```ts
// in each adapter's per-key update seam, beside routeProp
maybeSwapIntrinsic(node, name, value);
```

A no-op unless the node is in a choice family and `name` is its deciding prop. It needs only
`(node, name, value)` — which every one of the five seams has, including the four that carry no tag
— so it sidesteps the whole missing-tag problem instead of solving it per adapter. The decisive
argument is not ergonomic: five adapters each deciding WHEN to swap is the fifth-surface shape from
`adapter-parity-audit.md` — one rule set, five plumbings, every suite green, divergence found on a
device. One rule, one place.

Gate it on a module-level boolean the way `createElement` already gates `attachHostBehavior` on
`hasHostBehaviors()`; that comment carries the reasoning and the number, and this sits on a hotter
path (~32 000 prop writes on the same create where behavior attachment runs ~9 000 times).

Two corrections to what this file said before, both from that session and both worth keeping:

- **The per-node field is CHEAPER than "one field per node on the path we have been trimming"
  implies.** Every `SymbioteNode` field is `declare`d on the class and assigned in the constructor,
  so another one is a slot in the single hidden class, not a shape transition. The expensive shape
  is `styleParts`-style lazy objects, which this is not.
- **Store the ALTERNATIVE COMPONENT, not the tag.** Same information for this purpose, it is what
  `setNodeComponent` actually needs, and it is `undefined` for every primitive outside a choice
  family — which also resolves the non-injective map, since the `-managed` tags simply never get one.

A fourth shape was raised and rejected on the record rather than left unconsidered: a lowering
transform could emit the swap at the call site, where the tag is a literal in the same compiled
scope. Free at runtime, and it puts one rule back into four AST plumbings — the exact thing the
third shape avoids.

**And the `-managed`-never-meets-the-swap argument is TRUE on Solid, shown rather than asserted, and
must not be generalised.** Their `TextInput` wrapper builds its host node through `buildHost(multiline)`
inside a memo, taking `multiline` as an ARGUMENT rather than reading it as a prop, so a flip disposes
the old node and builds a new one; the file says so in three places. That holds because of how THAT
wrapper is written, not because of Solid, and says nothing about the other four.

**And on Android the native half of this hazard does not exist.** All four text-input intrinsics
resolve to ONE ViewManager (`component-names/index.android.ts:27-33`, "Android has one text-input
ViewManager for both"), so `setNodeComponent` no-ops there by construction:

```
ios      symbiote-text-input           -> RCTSinglelineTextInputView
         symbiote-text-input-multiline -> RCTMultilineTextInputView
android  both, and both -managed       -> AndroidTextInput
```

The refusal still has to hold on both platforms — the tag drives behavior registration at create,
which is a different question — but anyone reproducing a dynamic-`multiline` flip on an Android
device will see nothing, and that must not be read as the fix working.

Covered by `core/engine/src/__tests__/node-component-swap.test.ts` (5 cases: the swap, identity,
props carried across, children carried across, and the no-op). Break-tested: disabling the assign
reddens 4 of 5, and the survivor is exactly the no-op row.

**What this does NOT do on its own: retire `dynamicIntrinsicChoice`.** The engine can now honour a
flip, but each adapter's lowered path has to actually CALL the swap on update before its transform
can stop refusing. Until an adapter wires that, its refusal is still load-bearing — the same
distinction as engine-side state-style resolution, which unblocked a rename without performing one.


### The wiring shape, after all four adapters answered — no field, no tag

The question "how does a per-key seam know to swap" got four answers and they compose into one that
needs neither a stored tag nor a new node field. **Nobody has built it yet**; this is the design the
four converged on, recorded so it is not re-derived.

```
solid    the API shape: hand adapters the DECISION, not the data
         maybeSwapIntrinsic(node, name, value) beside routeProp, module-boolean gated
angular  family membership is readable from node.component — both single-line spellings collapse
         to RCTSinglelineTextInputView and both multiline ones to RCTMultilineTextInputView, and
         all four belong to the SAME intrinsicWhen family, so which spelling was authored does not
         affect the decision
vue      lowered-vs-managed is readable from BEHAVIOR PRESENCE — behaviors register only for the
         lowered tags; -managed registers nothing
svelte   the same discriminator seen from its own side: payloadFold is attached at create for
         exactly the behavior-bearing nodes
```

**The two ambiguities are complementary**, which is the whole finding: `node.component` cannot tell
lowered from managed, and behavior presence cannot tell which family — together they answer both,
from data every seam already has.

Three caveats to carry, each from the session that raised it:

- **The behavior discriminator is a PROXY** — true only while no `-managed` tag registers a
  behavior, and it flips silently the day one does. It wants a test asserting the managed tags have
  none, in the spirit of the ref-refusal proxy in `verify-the-deciding-side.md`.
- **`node.component` keying assumes two different primitives never share a Fabric view name.** That
  is NOT an enforced invariant and is already false in general — `symbiote-view` and
  `symbiote-pressable` both resolve to `RCTView`. It happens to hold for the choice families today.
  Guard it rather than inherit it.
- **A per-node field is not free the way it first reads.** The constructor already writes every
  slot, so another one is another write times nine thousand on a create — the same class of cost the
  prototype move and `styleParts` removed this month. That is an argument for the no-field shape,
  and it deserves a number if anyone picks the other.

### The two paths will DIVERGE on a flip, and the lowered one is better

Not a defect to fix — a fact to state before someone files it as a parity bug. Vue measured its
wrapper path: `multiline` false -> true takes `createNode` 2 -> 3, i.e. the element type changes and
the framework unmounts and remounts. So **the wrapper path already discards whatever native state
that input held — text, selection, focus.** The lowered path with `setNodeComponent` re-creates the
Fabric node while keeping the engine node, so an app's ref survives; whether native text survives is
a separate question nobody has measured.

The limit documented on `resolveIntrinsicTag` ("a later flip keeps the view it was created with")
therefore reads wrong if taken as lowered-is-worse. The two paths diverge in opposite directions,
and Solid's wrapper does the same thing as Vue's for the same reason (`buildHost(multiline)` inside
a memo, taking the value as an ARGUMENT). Both were shown by their own sessions rather than
asserted, and both hold because of how THOSE wrappers are written — not because of the framework.
