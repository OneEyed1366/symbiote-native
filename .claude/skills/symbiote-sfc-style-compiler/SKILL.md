---
name: symbiote-sfc-style-compiler
description: "Symbiote CSS/CSS-Modules compiler — CSS (a Vue SFC style block, or a standalone .css/.module.css file), PLUS optional SCSS/Sass, Less, and Stylus preprocessor sources, compiled at build time into RN style objects, resolved at runtime via a class-name registry shared by ALL adapters (React className, Vue class, Angular addClass/removeClass). Read BEFORE touching core/css-parser/**, core/engine/src/style-registry/**, the class+style merge in core/engine/src/node.ts routeProp, style-block handling in examples/*/metro-vue-transformer.js, any adapter's metro-css-parser.cjs / metro-css-transformer.js, or adapters/*/renderer.ts's class-prop handling. Covers @symbiote-native/css-parser (build-time postcss compiler, never shipped in the app bundle, distributed as a regular dependency of each adapter package rather than a per-app devDependency), core/css-parser/src/preprocessors.ts (lazy-optional sass/less/stylus, devDependencies only), core/engine/src/style-registry (registerStyles/resolveClassName/scopeClassName), routeProp's centralized class+style merge (core/engine/src/node.ts, replacing an earlier Vue-only patchProp hack), a compiler nodeTransform scoping class/:class bindings (static and dynamic, including an opaque runtime class string) to a per-file scope id, a :global() escape hatch, Vue <style module>/standalone .module.css CSS-Modules support, and React's className prop / Angular's addClass-removeClass token accumulation. Documents a pseudo-class bug found only by manually running parseCSS after unit tests were green, and a pnpm-hoisting lesson about resolving a build-time-only dependency through an adapter re-export instead of per-app devDependencies. Covers a SEPARATE per-component mechanism (§4b) where a non-class prop like ScrollView's contentContainerStyle or ImageBackground's imageStyle ALSO accepts a class-name string resolved via resolveClassName, plus the correct Pressable className/class (static) + style-as-function (dynamic-only) split — read this before assuming such a prop can't take a class. Records $style.card .d.ts generation, Svelte, and Tailwind as the remaining open seams."
---

# Symbiote CSS / CSS-Modules compiler

**Status: STABLE (2026-07).** Plain CSS, `scoped`, `:global(...)`, CSS
Modules (Vue `<style module>` AND standalone `.module.css` files, usable from
ALL THREE adapters), and optional SCSS/Sass, Less, and Stylus preprocessing
(§7, added 2026-07) are shipped and considered a stable public feature, not
experimental — safe to document and recommend without hedging. Svelte support
and Tailwind CSS are the remaining open seams (§ below); neither blocks
calling the rest of this stable. The class+style merge that makes a resolved
class usable from ANY adapter (not just Vue) is centralized in
`core/engine/src/node.ts`'s `routeProp` — see §4, rewritten 2026-07 from an
earlier Vue-only `patchProp`-level hack.

A CSS source — a Vue SFC `<style>` block, OR a standalone `.css`/`.module.css`
file imported from ANY adapter's own source file — compiles at build time
into a `Record<className, RNStyleObject>`; a `class`/`className` prop (or, for
CSS Modules, an already-scoped string handed in directly) resolves that object
back at render time through a runtime registry shared by every adapter. Ported
from wolf-tui's proven Vite-plugin-plus-registry precedent, retargeted at
Metro's single-pass text-in/text-out transformer and RN's
`ViewStyle`/`TextStyle` surface instead of wolfie's terminal-cell `Styles`
type.

**wolf-tui precedent — re-read before extending this feature:**
`wolf-tui/packages/plugin/src/vue-sfc.ts` (the Vite resolveId/load plugin —
study for the CSS-Modules branch, do NOT copy its plugin shape, Metro has no
virtual-module hooks), `wolf-tui/internal/css-parser/src/parser.ts`
(`extractClassName` + `parseCSS`, the part ported near-verbatim),
`wolf-tui/internal/shared/src/styles/registry.ts` (the registry, ported minus
Tailwind detection).

## The four pieces

```
<style> CSS text / .css file text          class="foo" / className="foo" / addClass
      │  (build time, Metro)                          │  (runtime, routeProp — all adapters)
      ▼                                                ▼
@symbiote-native/css-parser              @symbiote-native/engine's style-registry
  parseCSS() — postcss              registerStyles() / resolveClassName()
  core/css-parser/src/              core/engine/src/style-registry/
      │                                                ▲
      └── metro-*-transformer.js emits ─────────────────┘
          registerStyles({...}) at module load
```

### 1. `core/css-parser` (`@symbiote-native/css-parser`) — build-time ONLY

`parseCSS(css: string, options?: { filename?: string }): Record<string,
Record<string, unknown>>`. **Never shipped in the app's native JS bundle** —
runs only inside a Metro transformer, on the Node build machine. That's why it
carries a `postcss` + `postcss-value-parser` dependency (catalogued in the
root `pnpm-workspace.yaml`) that the runtime registry does not.

- `src/parser.ts` — `extractClassName` (selector → camelCase key: `.card` →
  `card`, `.btn.primary` → `btnPrimary` compound, `.card .title` →
  `cardTitle` descendant, `#id`/`[attr]` supported) and `parseCSS` (postcss
  AST walk, CSS custom-property/`var()` resolution, a narrow `calc()`
  evaluator). Both ported near-verbatim from wolf-tui — this half is
  target-agnostic, no TUI coupling.
- `src/properties.ts` — kebab-CSS-prop → camelCase-RN-prop mapping table,
  written FRESH for RN (wolf-tui's own table targets its terminal-cell
  `Styles` type, wrong shape to port). `text-shadow` bypasses this table (see
  below — RN has no engine-level processor for it, unlike `transform`/
  `box-shadow`/`filter`/`transform-origin`/`background-image`, all covered
  below). Any OTHER property not in the table (`animation`, `@media`, …) is
  silently dropped from the output with one deduped `console.warn` per
  unique property name per `parseCSS()` call — never throws.

  **`transform` and `box-shadow` are registered as plain `raw` passthrough
  (2026-07) — the value is renamed to its RN camelCase key and handed on
  UNPARSED, as-authored CSS text.** Mechanism: RN's native C++ expects an
  ALREADY-PARSED array of plain-number objects
  (`ReactNativeFeatureFlags::enableNativeCSSParsing()` defaults `false`), so
  RN's own JS renderer parses it first
  (`Libraries/StyleSheet/processBoxShadow.js`/`processTransform.js`,
  registered per-prop in `ReactNativeStyleAttributes.js`'s `{process: fn}`
  table) before `ReactFiberConfigFabric.js` calls `createNode`. Since
  SymbioteNative's engine talks to `nativeFabricUIManager` DIRECTLY (bypassing
  React's host config), it replicates that JS pre-parse itself:
  `core/engine/src/process-box-shadow` and `core/engine/src/process-transform`
  are JS ports of RN's own processors, wired into every style commit via
  `core/engine/src/commit.ts`'s `STYLE_PROCESSORS` map (keyed only by prop
  name, uniform for hand-written `StyleSheet.create` and this CSS compiler
  alike). So css-parser needs no own box-shadow/transform parser — it renames
  the CSS property to the RN key and hands the text through untouched; the
  engine's already-tested processors do the real parsing at commit time
  (`inset`, spread-radius, multi-shadow, `matrix()`/`perspective()`/
  `translate3d()` all included). See
  `core/engine/src/process-box-shadow/index.ts` and
  `core/engine/src/process-transform/index.ts`, and `commit.ts`'s
  `STYLE_PROCESSORS`/`processValue` for the wiring.

  ```
  §ruled_out_hand_rolled_shadow_transform_parser := {
    ruled_out: "an earlier same-day version hand-rolled a parser for both —
               decomposed box-shadow into shadowColor/shadowOffset/
               shadowOpacity/shadowRadius + an elevation heuristic, dropped
               inset/spread-radius/multi-shadow with a warning, dropped
               matrix()/perspective() from transform",
    why_wrong: "reading .vendors/react-native directly shows boxShadow and
               transform are both real, fully-native Fabric style props on
               iOS AND Android (BoxShadowPropsConversions.h,
               RCTBoxShadow.mm, BoxShadow.kt,
               InsetBoxShadowDrawable.kt/OutsetBoxShadowDrawable.kt) —
               genuinely supporting everything the hand-rolled version
               dropped",
    lesson: "before hand-rolling a CSS->RN value conversion, check whether
            core/engine/src already has a process-* port of the matching RN
            Libraries/StyleSheet/process*.js file — the
            passthrough-raw-string + let-the-engine-parse-it pattern applies
            to any future CSS property that is one of RN's own
            JS-preprocessed style props (also covers filter, transformOrigin,
            aspectRatio, fontVariant — see STYLE_PROCESSORS for the current
            list)",
  }
  ```

  `text-shadow` is different: RN has NO unified CSS-string `textShadow` prop
  at all (no `processTextShadow.js` exists in RN's source, and
  `TextStyle`/`ShadowStyle` only expose the three separate legacy props
  `textShadowColor`/`textShadowOffset`/`textShadowRadius`, no composite/no
  engine-level processor to defer to) — so decomposing the CSS shorthand
  really is this package's job, and stays hand-rolled in `values.ts`.

- `src/values.ts` — `px` → plain `number`, `%` stays a `string`, colors pass
  through as raw strings unchanged. `REM_TO_PX = 16` is SymbioteNative's own
  constant (RN has no root-font-size registry to derive it from); wolf-tui's
  `1rem = 4 cells` scaling is dropped entirely, not adapted. Also holds
  `parseTextShadow` (2026-07) — decomposes CSS `text-shadow` (e.g.
  `1px 1px 2px black`) into `textShadowColor`/`textShadowOffset`/
  `textShadowRadius`; only the first of a comma-separated multi-shadow value
  is applied (with a warning) since RN's TextStyle takes exactly one. Parses
  with `postcss-value-parser` (not a regex split) so a color function's
  internal commas (`rgba(0, 0, 0, .3)`) can't be mistaken for a top-level
  multi-shadow separator — the same top-level-comma-aware approach
  `var()`/`calc()` resolution in `parser.ts` already relies on.
- `src/preprocessors.ts` — optional SCSS/Sass, Less, and Stylus support (§7).
  A style with a recognized preprocessor extension/`lang` is reduced to plain
  CSS text here, BEFORE `parseCSS()` ever sees it — `parser.ts`/`properties.ts`/
  `values.ts` above are entirely unaware preprocessing exists.

### 2. `core/engine/src/style-registry/` — runtime, ships in the app bundle

`registerStyles(styles)`, `resolveClassName(className)`, `clearGlobalStyles()`
(test isolation). A global `Map<string, Partial<IViewStyle & ITextStyle>>`
with compound-selector permutation lookup — `class="btn primary"` in a
template finds a `.btn.primary` rule that got registered under the single key
`btnPrimary`. Ported from wolf-tui's registry MINUS its Tailwind-utility
auto-detection (`isTailwindUtility`, `STATIC_UTILITIES`/`UTILITY_PREFIXES` —
not part of this feature, do not resurrect without a separate design pass)
and MINUS its kebab-case fallback lookup (this compiler always emits camelCase
keys, so no dual-casing lookup was needed). Exported from
`core/engine/src/index.ts` next to `StyleSheet`.

This module never touches CSS or postcss — it is a plain string-keyed lookup,
by design, so it costs nothing extra in the shipped bundle.

### 3. `examples/vue-sfc/metro-vue-transformer.js`

Reads style blocks via `@vue/compiler-sfc`'s **`descriptor.styles`**, not a
hand-rolled regex extractor like wolf-tui's `extractStyleBlocks` — Vue's own
SFC parser already gives pre-parsed `{ content, lang, ... }` blocks, which is
simpler and immune to a `</style>`-lookalike inside a string breaking a greedy
regex match. For each block, calls `@symbiote-native/css-parser`'s `parseCSS()`,
merges multiple blocks with last-wins semantics (same cascade wolf-tui
documents), and prepends this to the compiled module source:

```js
import { registerStyles } from '@symbiote-native/engine';
registerStyles({/* merged parseCSS() output */});
```

No `<style>` block → no injected code, zero behavior change for style-less
`.vue` files. `lang="scss"`/`"sass"`/`"less"`/`"stylus"` are preprocessed
first (§7); any OTHER `lang` value still throws
(`SFC style lang="X" not supported yet — plain CSS only`) rather than
silently mis-compiling.

### 4. `core/engine/src/node.ts` `routeProp` — the cross-adapter class+style merge

`routeProp` is the engine's general prop-mutation entry point — see the
`symbiote-engine-core` skill for its full contract (event-vs-prop inference off
the ViewConfig, `__self`/`__source` stripping, responder wiring). This section
covers only its `class`/`style` specialization.

**Rewritten 2026-07 — was Vue-only, now shared by every adapter.** The
original design put the class/style merge inside Vue's own `patchProp`
(`adapters/vue/src/renderer.ts`), which worked but meant React and Angular
each would have had to reimplement the identical merge to get `className` /
`addClass` resolving through the registry — a violation of
`<adapters_stay_thin>`. It now lives once, in the engine's `routeProp`
(`core/engine/src/node.ts`), and every adapter's class-prop path funnels
through it: Vue template `class="foo"` (`patchProp` → `routeProp`), React JSX
`className="foo"` (the reconciler's `applyProps`/`applyUpdate` already called
`routeProp` for every prop key — React needed **zero renderer changes**, only
the `className` field on `IViewProps`/`ITextProps`,
`adapters/react/src/components.ts`), and Angular's `addClass`/`removeClass`
(Ivy compiles every `class=`/`[class.foo]`/`[ngClass]` form to **per-token**
addClass/removeClass calls, never a single string — `SymbioteRenderer`
accumulates a per-node `Set<string>` of tokens and re-joins it into one string
on every change, then calls `routeProp(el, 'class', joined)`, same entry point
as the other two — see `adapters/angular/src/renderer.ts`).

**The non-obvious part, unchanged from the original design.** `class`/`style`
(or React's `className`/`style`) can each be set independently and out of
order — Vue's `patchProp` fires one call per changed key, Angular's
`addClass`/`removeClass` and `setStyle` are separate `Renderer2` calls, and
even React re-invokes `routeProp` once per changed prop on an update. The
engine's `setProp` does a flat overwrite (`node.props[key] = value`, no merge),
so naively routing both branches to `routeProp(el, 'style', ...)`
independently would let whichever call runs _last_ silently clobber the
other. That is wrong: explicit `style` must always win over class-derived
style, like CSS cascade specificity, regardless of call order.

Fix, in `node.ts`:

```ts
const classStyleParts = new WeakMap<
  ISymbioteNode,
  { classStyle?: unknown; explicitStyle?: unknown }
>();
const CLASS_PROP_KEYS: ReadonlySet<string> = new Set(['class', 'className']);
// routeProp: 'class'/'className' -> commitClassStyle(node, { classStyle: resolveClassName(...) })
//            'style'             -> commitClassStyle(node, { explicitStyle: value })
// commitClassStyle always does: setProp(node, 'style', [entry.classStyle, entry.explicitStyle]);
```

Both branches always write a **2-element array in fixed order**
(`[classStyle, explicitStyle]`), and let `core/engine/src/style/index.ts`'s
existing `flattenStyle` do the actual collapse (array flatten is already
later-wins, falsy-entry-skipping — reused, not reimplemented). This makes the
explicit half always win regardless of call order, without hand-merging style
objects. The literal string `class`/`className` never reaches `node.props` —
RN has no attribute-selector concept to give it meaning. `getExplicitStyle
(node)` is exported for an adapter that builds its style prop up **key-by-key**
instead of handing over one whole object (Angular's Ivy `ɵɵstyleProp`/
`setStyle`) — it must merge onto that, not onto `node.props.style` directly,
which may now be the `[classStyle, explicitStyle]` array `routeProp` writes
(spreading an array as a record would silently produce numeric-index keys —
this is the bug `getExplicitStyle` exists to prevent). WeakMap keyed on the
raw `ISymbioteNode` is safe here (confirmed against the
`vue-adapter-reactivity` skill — `el` inside Vue's `patchProp` is never
Vue-proxy-wrapped, so identity holds); entries GC automatically on unmount.

Prop-type note: `className` was added to React's `IViewProps`/`ITextProps`
directly (`adapters/react/src/components.ts`) rather than promoted to the
shared agnostic base in `core/components` — per
`<prop_types_split_agnostic_vs_per_adapter>` this is a framework-idiom field
(React's own web convention), not a cross-framework-safe type; Vue authors
`class=` in templates, Angular authors `class=`/`[ngClass]=`, React authors
`className=` — three different idioms over the SAME underlying registry.

## 4b. Secondary style props (`contentContainerStyle`, `imageStyle`, …) — a SEPARATE, per-component mechanism

`routeProp`'s class+style merge above is scoped to the literal `class`/
`className`/`style` triad on a host node. It is NOT the only place
`resolveClassName` gets called — several components ALSO accept a class-name
string on a secondary, non-`style`-named prop that targets an inner or
composed part of the component. This is implemented per-component, ad hoc,
not centrally by the engine — a real gap this skill left undocumented until a
migration session (2026-07) wrote NEW code claiming these props "never reach
the class registry", which was wrong and had to be corrected once the user
pointed at the actual adapter source.

Known instances, all typed `IStyleProp<T> | string` with the same inline
resolver shape (`typeof x === 'string' ? resolveClassName(x) : x`):

- **`contentContainerStyle` (ScrollView)** — `adapters/{react,vue,angular}/src/components/scroll-view/shared.ts`. Angular exposes it as a `resolvedContentContainerStyle` getter; React/Vue inline the same ternary at the point `selectScrollIntrinsics` consumes it.
- **`imageStyle` (ImageBackground)** — `adapters/{react,vue,angular}/src/components/image-background*`. Targets the INNER image, as opposed to `style` which is the wrapper View — same string-resolves-via-registry shape.

A NEW component that wants this needs to add its OWN resolver at the same
shape — there is no shared helper to call beyond `resolveClassName` itself
(exported from `core/engine/src/style-registry`). Before assuming a
non-`style`/`class` prop "can't" take a class name, grep the target
component's `shared.ts`/`index.ts` for `resolveClassName` first.

**Pressable's `style` (function-of-press-state) vs its `className`/`class`
(plain static) — a related but distinct split.** `Pressable`'s `style` prop
can be a function of press state (`({ pressed }) => StyleProp`), which a CSS
class fundamentally cannot express (compiled statically, no runtime
branching). But Pressable ALSO carries an ordinary static `className?:
string` (React, `adapters/react/src/components/pressable/index.ts`) / `class?:
IClassNameValue` (Vue, `adapters/vue/src/components/pressable.ts`) prop,
entirely separate from `style`. The correct idiom for "static look + a
press-state-dependent color change" is: move every static property into a CSS
class via `className`/`class`, and let `style` be a function that returns
ONLY the properties that truly vary with press state —

```tsx
<Pressable
  className="pressable-card"
  style={({ pressed }) => ({
    backgroundColor: pressed ? '#13243a' : '#0f1e30',
  })}
/>
```

— NOT `style={({ pressed }) => [styles.pressableCard, { backgroundColor: ... }]}`
with the entire static shape stuffed into the array's first element. The
latter was the exact mistake made in `examples/{react,vue-tsx}/App.tsx`
(fixed 2026-07): a comment justified keeping the WHOLE style object in JS
"because `style` is a function", conflating "the style prop can be a
function" with "therefore nothing here can be a class" — the two are
independent; only the genuinely dynamic subset needs the function.

## How to verify this quickly

```bash
npx vitest run core/css-parser              # parser + compileCssFile + createCssMetroTransformer
npx vitest run core/engine/src/__tests__/class-style-merge.test.ts   # routeProp merge (all adapters)
npx vitest run adapters/vue                 # ScrollView class/style forwarding
npx vitest run adapters/react/src/class-name.test.tsx                # React className resolution
npx vitest run adapters/angular/src/renderer.test.ts                 # Angular addClass/removeClass
npx vitest run examples/vue-sfc             # transformer <style>/<style module>/.css tests

# manual ad-hoc check — pure Node, no RN/build needed, this is how a real bug (below) was found
node -e "
import('$PWD/core/css-parser/src/index.ts').then(({parseCSS}) => {
  console.log(parseCSS('.card { padding: 10px } .card:hover { opacity: .5 }'));
});
"
```

**Manually run `parseCSS` on real-world-shaped CSS before trusting a change
to `parser.ts`/`properties.ts` green from unit tests alone.** Unit tests only
catch what someone thought to write a case for; this is table-driven,
ported/adapted selector logic, exactly the kind of code where a plausible
port silently diverges from the target's actual semantics on inputs nobody
wrote a test for.

### The pseudo-class bug this practice caught

```
§pseudo_class_trailing_real_class := {
  bug: "`.card:hover{opacity:.5}` — pseudo-class TRAILING a real class, not
       bare `:hover`. extractClassName tested bare `:hover` (-> null), but
       its compound-selector branch matched `.card:hover` as compound
       FIRST, registering under a dead unreachable key `card:hover`",
  ruled_out: "interim fix stripping just the pseudo suffix, resolving
             `.card` — WORSE: silently merged hover-only opacity:0.5 into
             the base `.card` style permanently",
  fix: "parser.ts — after removing `[...]` attribute contents (may contain
       a colon, e.g. `[data-x=\"a:b\"]`), any remaining `:` ANYWHERE drops
       the WHOLE rule, same as bare `:hover` ⟶ RN has no hover/focus/
       nth-child concept, no partial-application semantics to preserve",
  verified: "regression test covers `.card:hover`",
}
```

## 5. Vue `<style scoped>` and `:global(...)` — implemented

`<style>` with no `scoped` attribute behaves exactly like piece 3 above:
classes register globally, unsuffixed, shared across every component. A
`<style scoped>` block's classes are suffixed at registration time —
`card` → `card__data-v-xxxxxxxx`, using the SAME `scopeIdFor(filename)` hash
`metro-vue-transformer.js` already computed for `compileScript({ id })` — so
two components can each own a `.card` without colliding in the shared
registry. This is the _intent_ of Vue's real `data-v-hash` DOM-attribute
mechanism, reimplemented as a name suffix instead, since SymbioteNative has no DOM
and no attribute-selector matching (`class` is always a flat string-keyed
`Map` lookup, full stop).

**The non-obvious part, and why this needed a compiler `nodeTransform`, not a
raw-text regex rewrite of the template (the originally-considered, simpler-
looking approach — read this before "simplifying" it back):** Vue allows a
static `class="card"` and a dynamic `:class="expr"` on the SAME element, and
**Vue's own `transformElement` already merges both into ONE `class` codegen
entry** before emitting `normalizeClass(...)`. A text-level regex pass over
the raw template can't reproduce that merge safely (it would have to
reimplement Vue's own merge logic, or risk emitting two conflicting `:class`
bindings). Instead, `metro-vue-transformer.js` passes a custom `nodeTransform`
into `compileScript({ inlineTemplate: true, templateOptions: {
compilerOptions: { nodeTransforms: [...] } } })` (`nodeTransforms`/
`directiveTransforms` are real, public, stable fields of
`@vue/compiler-core`'s `TransformOptions`, confirmed by reading the installed
package source — not a private/internal mechanism, and `inlineTemplate: true`
forwards them through unmodified, no need to call `compileTemplate()`
separately). The transform:

- A static `AttributeNode` (`prop.type === 6`, `name === 'class'`) — its
  string content is rewritten DIRECTLY, at compile time: every space-
  separated token that's in this file's locally-scoped class set gets the
  `__${scopeId}` suffix, everything else (a class from a sibling _unscoped_
  block in the same file, or literally anything else) passes through
  untouched. No runtime call needed for the purely-static case.
- A dynamic `bind` `DirectiveNode` targeting `class` (`prop.arg.content ===
'class'`) — its expression node (`prop.exp`) is wrapped, via
  `@vue/compiler-core`'s `createCompoundExpression`, into a call to
  `scopeClassName(<original expression, untouched>, __localScopedClassNames,
__scopeId)` (`scopeClassName` — `core/engine/src/style-registry/index.ts`
  — imported as `__scopeClass`). Vue's own `normalizeClass()` still runs
  afterward on `scopeClassName`'s return value exactly as it would have on
  the original, so no other codegen shape changes.

Because our transform runs on `prop.exp`/`prop.value` **before** Vue's own
merge-and-normalize logic executes, `transformElement`'s merge of a
same-element static `class=` + dynamic `:class=` into one codegen entry still
runs _on our rewritten nodes_, unmodified — this is what makes the mixed case
(`class="card" :class="{ active: isActive }"`) come out correctly without any
special-case merge code of our own. `scopeClassName` does its token-matching
at **runtime**, so even a fully opaque dynamic value the compiler can't see
into (`:class="someRuntimeString"`) still resolves correctly — there is no
unresolved gap for dynamic scoped classes, static or dynamic, alone or mixed.

`:global(.reset)` inside a `<style scoped>` block opts that one selector out
of scoping, exactly like real Vue. Two pieces: `@symbiote-native/css-parser`'s
`extractClassName` recognizes the `^:global\(\s*(.+?)\s*\)$` wrapper and
recursively resolves the selector inside it (so `:global(.btn.primary)` still
resolves via the ordinary compound-selector path to `btnPrimary`) — this had
to be checked BEFORE the pseudo-class-drop rule from the bug above, since
`:global(...)` legitimately contains a colon that must NOT trigger a drop.
Separately, `metro-vue-transformer.js`'s own `globalClassNamesIn()` re-scans
a scoped block's raw CSS text with an independent regex to find which keys
came from inside a `:global()` wrapper, since `parseCSS`'s return shape
(`{ className: style }`) carries no such marker — those names are excluded
from suffixing and from `__localScopedClassNames`, registering exactly like
an unscoped class.

## 5b. Compound selectors under scope — fixed for TWO of four forms 2026-08-14, the rest 2026-08-19

> **Correction, 2026-08-19.** The 2026-08-14 fix below closed Vue `<style scoped>` and Svelte
> `<style>` only. Compound rules stayed DEAD in **both CSS-Modules forms** — a standalone
> `.module.css` and Vue's `<style module>` — for five more days, and the conformance test was
> green the whole time because it covered `data-v-` (7 cases) and `svelte-` (8) and `__module__`
> zero times. See §10 for the mechanism and the fix.

```
§5b_compound_under_scope := {
  bug: "FIXED 2026-08-14 — `.card.big{}` inside `<style scoped>` (Vue) or
       `<style>` (Svelte) never applied. No warning/error; compiled,
       registered, never looked up. Unscoped/global CSS fine (why it went
       unnoticed — examples/*/App.css compound selectors work)",
  root_cause: "two ops don't commute — registration collapses compound
              selector to ONE key then suffixes IT (`.card.big` -> `cardBig`
              -> `cardBig__data-v-h`); markup rewrite suffixes each TOKEN
              (`class=\"card big\"` -> `class=\"card__data-v-h
              big__data-v-h\"`); runtime toCompoundKey concatenates the
              given tokens -> `card__data-v-hBig__data-v-h`, never equals
              the registered key for any input ⟶ lookup falls through to
              per-class merge, only single-class rules applied",
  second_defect: "localScopedNames/localNames built from
                 Object.keys(parseCSS(...)), i.e. the COLLAPSED keys.
                 `.card.big` contributes only `cardBig`, absent from markup
                 ⟶ if `.big` had no standalone rule, the `big` token was
                 never scoped — unreachable via a second, independent route",
  fix: ["css-parser exposes extractClassTokens(selector) (un-collapsed form,
         extractClassName now built on it) + classTokensIn(css) mapping key
         -> tokens",
        "both transformers add those TOKENS to the local-scoped-name set:
         adapters/vue/metro-vue-transformer.cjs and
         adapters/svelte/src/preprocessor/scoped-styles.ts, same 3 lines",
        "style-registry compound lookup strips the shared suffix off every
         token of the subset, joins bases, re-appends once
         (`card__svelte-h`+`big__svelte-h` -> `cardBig__svelte-h`) — only
         when ALL tokens carry the SAME scope; unsuffixed key still tried
         alongside"],
  behavior_changes: ["compound rule now LAYERS OVER single-class rules
                     instead of replacing them — `.card{padding:8;
                     background:white}` + `.card.big{padding:16}` on
                     class=\"card big\" -> padding 16 AND background white
                     (old early-return dropped unrestated properties)",
                     "scoped token layers over its own unscoped base —
                     `card__svelte-h` resolves `card` first, scoped rule on
                     top, mirroring the web cascade"],
  trap: "scoped token recognized by SUFFIX SHAPE
        (/^(?:data-v|svelte)-[0-9a-z]+$/), never by presence of a bare
        `__` — BEM `card__title` would collide if split naively",
}

§5b2_mixed_scoped_global_tokens := {
  bug: "FIXED 2026-08-15 — was dismissed as 'low value', turned out to be
       the WHOLE partial-`:global()` feature. Compound rule with one scoped
       + one unscoped token (`:global()`-exempt, App.css-only class, or
       parent-provided) used to bail: 'no single suffix to factor out'",
  root_cause: "exactly what partial `:global()` produces —
              `.card :global(.legacy)` registers collapsed key
              `cardLegacy__<scope>` (rule still scoped to file's own
              `.card`) against markup `card__<scope> legacy` (escape hatch
              exempts the TOKEN). Both halves individually correct, could
              never meet",
  fix: "scopedCompoundKey treats an unscoped token as contributing its own
       name + no scope, so the one present scope is still factorable; two
       tokens with DIFFERENT suffixes still bail (no rule spans two
       components)",
  tradeoff: "a fully-scoped `.card.reset` now collapses to the SAME key as
            `.card :global(.reset)` — a foreign `reset` matches a rule its
            author scoped to their own. Key format can't distinguish them;
            fix needs a registry indexed by token SET with per-token scope",
  verified: "scoped-conformance.test.ts (behavior asserted deliberately);
            e2e: adapters/svelte/src/components/scoped-styles.smoke.test.ts,
            'partial :global() under scope'",
}

§5b3_device_verify_needs_three_tarballs := {
  lesson: "css-parser is a regular dep of every ADAPTER, so an example
          pinning only the adapter+engine resolves css-parser from the
          REGISTRY -> build-time crash on first missing export
          (`classTokensIn is not a function`)",
  gotcha: "css-parser is already a direct devDependency of each example, so
          `overrides` can't redirect it either — npm: `EOVERRIDE: Override
          for @symbiote-native/css-parser conflicts with direct dependency`",
  fix: "point the devDependency straight at the tarball:
       `\"@symbiote-native/css-parser\": \"file:../../core/css-parser/
       symbiote-native-css-parser-<v>.tgz\"`, then the usual reinstall dance
       (delete node_modules/@symbiote-native + package-lock.json, npm
       install, pod install)",
  scope: "TEMPORARY — swaps back to a literal version once css-parser has a
         release carrying the export",
}
```

### `var()` resolves ONLY within one compiled file — a per-component stylesheet cannot reach App.css

```
§var_scope_is_per_file := {
  bug: "measured 2026-08-15 adding
       examples/angular/src/components/CompoundClassDemo.css — parseCSS
       collects custom properties via root.walkDecls over the CSS string it
       was handed, so the variable table is per-CALL, i.e. per FILE",
  symptom: "a component stylesheet writing var(--mist) against a token
           declared in App.css's :root finds nothing; resolveVariables
           leaves the text alone on a miss ⟶ the LITERAL STRING
           \"var(--mist)\" registers and reaches Fabric:
           `.badge { border-color: var(--mist); }` ->
           `{ borderColor: \"var(--mist)\" }` ships as-is. No warning, no
           error, tsc/ngc both happy — on device the color silently does
           not paint",
  rule: "custom properties usable only in the file that declares them.
        App.css declares :root and may use var() freely within itself
        (why .badge/.badge.loud rules appended to examples/react/App.css
        and examples/vue-tsx/App.css DO resolve — same file). Every OTHER
        stylesheet must use literals — the previously-unrecorded reason
        every pre-existing examples/angular/src/components/*.css is
        literal-valued",
  verify: "node -e \"console.log(require('./core/css-parser/build/index.js')
          .parseCSS(require('fs').readFileSync('<file>','utf8')))\" — any
          \"var(--…)\" in the output is a bug",
  open: "making var() cross-file needs a shared variable table threaded
        through every parseCSS call — deliberate design step, not a quick
        fix, since the compiler is per-file by construction (one Metro
        transform per stylesheet)",
}
```

## 6. CSS Modules — implemented (2026-07), two forms

Both forms reuse the SAME suffixing scheme: a class registers under
`${className}__module__${scopeId}` (the `module` tag disambiguates from
`<style scoped>`'s plain `${className}__${scopeId}`, so a file that happens
to mix `scoped` and `module` blocks with the same class name can't collide in
the shared registry — a real regression test covers this, see
`metro-vue-transformer.test.ts`). `resolveClassName` needed **no changes** —
a template/JSX binding that hands over the already-scoped string (`$style.card`
/ `styles.card`) just passes straight to the registry's existing exact-match
path.

### Inline Vue `<style module>` — `examples/vue-sfc/metro-vue-transformer.js`

`descriptor.styles[i].module` (a `string | boolean`, confirmed in
`@vue/compiler-sfc`'s type defs alongside `.scoped`) flags a `<style module>`
block inline, in the SAME `.vue` file — parsed via the SAME `parseCSS()`,
scoped via the SAME `scopeIdFor(filename)` hash already used for `scoped`
blocks. The binding name is `$style` by default, or the block's
`module="name"` value; `compileSfc` emits it as a plain top-level `const`
holding the name→scopedName map (`const $style = {"card":"card__module__…"}`),
placed before the compiled `export default {...}` so it's a closed-over
module-scope variable inside `setup()` — usable both from the inlined
template (`:class="$style.card"`) and from `<script setup>` code itself
(`$style.card`), no extra wiring on either side. Unlike `scoped`, a module
block's classes are **never** added to `__localScopedClassNames` — CSS
Modules is opt-in per usage via `$style.x`, so a literal `class="card"`
elsewhere in the same file must stay unsuffixed. `:global(.name)` opts a
selector out of scoping, same mechanism as `scoped`.

### Standalone `.css` / `.module.css` file imports — `core/css-parser`'s `compileCssFile`

The framework-agnostic form, usable from ANY adapter's own source file:
`import styles from './Card.module.css'` works the same from a React `.tsx`,
a Vue `<script>`, or an Angular `.ts` — `core/css-parser/src/metro-css-
module.ts`. A plain `.css` file registers its classes globally (side-effect
import only, `import './theme.css'`, no default export) — the standalone
twin of an unscoped Vue `<style>` block. A `.module.css` file is ALWAYS
scoped (that's the entire point of the extension) and its default export is
the name→scopedName map, exactly like Vue's `$style`. Scope id here is a bare
hash of the file's own path (`core/css-parser/src/file-scope-id.ts`'s
`hashFilePath`, NOT prefixed `data-v-` — that prefix is Vue's own
`compileScript({id})` convention, unrelated to a plain file's scope id; both
share the same hash algorithm so it isn't duplicated).

**2026-08-20 — `.module.*` renaming is lightningcss's job now, not ours.**
`compileCssFile`'s module branch runs `lightningcss.transform({ cssModules:
{ pattern: '[local]__module__<hashFilePath>' } })` and hands the RENAMED css
to `parseCSS`; the hand-rolled suffix loop, the compound-only-token export
loop, and the module path's `globalClassNamesIn`/`globalClassTokensIn` calls
are gone (both helpers stay — the Vue transformer and the Svelte
preprocessor still use them, and those are on their own scoping shapes).
lightningcss is MPL-2.0 against our MIT: depend, never vendor or patch.

Four consequences worth knowing before reading a `.module.*` snapshot:

- **The scope tail is still `hashFilePath`, deliberately NOT lightningcss's
  own `[hash]`.** Its hash is mixed-case (`qZnRla`) and the runtime
  registry's `SCOPE_TAIL_PATTERN` alphabet is lowercase base36, so `[hash]`
  would silently kill scoped-token base layering. A literal in the pattern
  string works, so all three scoping shapes keep one hash algorithm.
- **A compound/descendant rule registers a DIFFERENT key shape.** parseCSS
  now collapses already-renamed tokens: `.card.big` →
  `card__module__hBig__module__h`, not `cardBig__module__h`. Both resolve —
  the registry's `compoundKeysFor` tries the raw concatenation alongside the
  refactored `scopedCompoundKey`, and the new shape hits the first.
  `metro-css-module/module-runtime.test.ts` pins that both halves meet.
- **The export map only carries classes the AUTHOR wrote.** `:global(.reset)`
  is no longer exported (`styles.reset` is `undefined` — write the literal
  `"reset"`, the unsuffixed key is registered), and the synthesized collapsed
  compound key is gone too (`styles.badgeLoud` → write
  `` `${styles.badge} ${styles.loud}` ``). Both match every other CSS Modules
  implementation.
- **`composes` works, and the emitted token order is composed-first.**
  `.inherited { composes: card }` exports `"card__module__h
inherited__module__h"` — the registry merges a class string left to right,
  so composed-last would let the base override the composer. Chains are
  flattened on our side; lightningcss reports one hop.
- **`exports` is a Rust HashMap and its iteration order is randomized PER
  PROCESS** (measured: three runs, three orders). The map is emitted
  key-sorted; do not "simplify" that away or Metro's content cache churns on
  every build.

Metro wiring: each example's own `metro.config.js` adds `'css'`, `'scss'`,
`'sass'`, `'less'`, and `'styl'` to `resolver.sourceExts` and points
`transformer.babelTransformerPath` at a tiny per-app wiring file built on
`@symbiote-native/css-parser`'s exported `createCssMetroTransformer(upstreamTransformer)`
(`core/css-parser/src/metro-transformer.ts`) — the "preprocess if needed,
compile the resulting CSS, delegate everything else to the upstream RN babel
transformer" branch lives ONCE there, not copy-pasted per app. Vue's
`metro-vue-transformer.js` handles every style extension inline alongside its
existing `.vue` handling (both need the SFC-vs-standalone distinction in one
file, since Metro allows only one `babelTransformerPath`); React's and
Angular's examples each have their own minimal `metro-css-transformer.js`
that just calls the factory.

### Distribution: css-parser is a dependency of each ADAPTER, not each app — a pnpm-hoisting lesson

`@symbiote-native/css-parser` is a regular `dependency` of `@symbiote-native/react`,
`@symbiote-native/vue`, and `@symbiote-native/angular` (never a peer, never a devDependency
of the example apps) — each adapter package also re-exports it verbatim via a
tiny `.cjs` file at its own root (`adapters/react/metro-css-parser.cjs`, etc.,
exposed as the `./metro-css-parser` subpath in `package.json` `exports`), so
a consuming app writes `require('@symbiote-native/react/metro-css-parser')` instead
of needing `@symbiote-native/css-parser` in its OWN `package.json` at all — matching
the "framework ships the whole feature" ethos of
`<adapters_reach_full_feature_parity>`.

```
§hoisting_does_not_cross_workspace := {
  ruled_out: "assumed .npmrc (node-linker=hoisted, shamefully-hoist=true)
             makes a regular dep of @symbiote-native/react transitively
             resolvable from ANY app depending on @symbiote-native/react —
             i.e. hoisting propagates workspace-wide",
  verified_false: "pnpm's hoisted linker gives each workspace package its
                  OWN scoped node_modules for ITS dep tree only —
                  css-parser landed in adapters/react/node_modules/
                  @symbiote-native/css-parser but NOT examples/react or the
                  workspace root; confirmed by removing the app's
                  devDependency entry, require failed, fresh pnpm install",
  root_cause: "Node's CJS resolution is FILE-SYSTEM-ANCESTRY based, not
              dependency-graph based — require() resolves relative to the
              REQUIRING FILE's own directory",
  fix: "the file doing require('@symbiote-native/css-parser') must live
       INSIDE the adapter package (adapters/react/metro-css-parser.cjs),
       where css-parser genuinely resolves (real dep, symlinked); the
       app's wiring file requires THAT file via the exports subpath —
       Node resolves relative to the adapter's own location regardless of
       the app's hoisted view",
  gotcha: ".cjs not .js — adapter package is \"type\":\"module\", so a
          bare .js there parses as ESM (require/module.exports would
          ReferenceError); .cjs forces CommonJS regardless",
}

§hoisting_divergence_metro_babel_transformer := {
  bug: "narrower version, NOT css-parser-related — hit
       @react-native/metro-babel-transformer for Angular",
  symptom: "react-native IS a real direct dep of examples/angular
           (confirmed via `pnpm why`, same path as React/Vue), yet
           @react-native/metro-babel-transformer (its transitive dep)
           hoisted into examples/react and examples/vue-sfc's
           node_modules but NOT examples/angular's, even after a full
           clean reinstall",
  ruled_out: "chasing the per-package hoisting divergence — fix below is
             robust regardless of cause",
  fix: "anchor require.resolve at @react-native/metro-config's own
       installed dir — metro-config depends on metro-babel-transformer
       itself, so pnpm guarantees the resolve:",
}
```

```js
const path = require('path');
const metroConfigPkgPath =
  require.resolve('@react-native/metro-config/package.json');
const upstreamTransformer = require(
  require.resolve('@react-native/metro-babel-transformer', {
    paths: [path.dirname(metroConfigPkgPath)],
  }),
);
```

See `examples/angular/metro-css-transformer.js` for the real, working version
of this. If a future app's own `babelTransformerPath` wiring throws
`Cannot find module '@react-native/metro-babel-transformer'`, this is why —
don't add it as an explicit devDependency pin as a first move; try the
anchored `require.resolve` first, since it's robust to whatever hoisting
quirk caused the gap, not just this one instance of it.

## 7. SCSS/Sass, Less, and Stylus preprocessors — implemented (2026-07)

`core/css-parser/src/preprocessors.ts` reduces a preprocessor source down to
plain CSS text; `parser.ts`'s `parseCSS()` is the single, UNCHANGED downstream
consumer of that text either way — every CSS-Modules/`scoped`/`:global()`
mechanism in §5/§6 runs identically regardless of source language, since by
the time it runs the language distinction is already gone. Recognized by
extension (`.scss`/`.sass` → `scss`, `.less` → `less`, `.styl`/`.stylus` →
`stylus`, `detectLanguage()`) for a standalone file, or by the SFC `<style
lang="...">` attribute for an inline Vue block — the two are keyed
differently (extension vs. explicit lang string) because an inline block has
no file extension of its own.

**Ported from wolf-tui's own already-working preprocessor layer** —
`wolf-tui/internal/css-parser/src/preprocessors.ts` — MINUS its Tailwind
branch (`TailwindCompiler`, `getTailwind()`, the `compile()` function's
`@tailwind`/`@import "tailwindcss"` detection): Tailwind is a separate,
deliberately out-of-scope concern for this compiler (see the
`symbiote-tailwind-support` skill for why it needs a fundamentally different,
non-preprocessor shape — whole-project class scanning + JIT generation, not a
source-reduces-to-CSS transform). The `compileScss`/`compileSass` (alias),
`compileLess`, `compileStylus`, `detectLanguage`, and unified `compile()`
shapes carry over close to verbatim; only the Tailwind-adjacent parts were
dropped.

**Lazy-optional dependency pattern.** `sass`, `less`, and `stylus` are
`devDependencies` of `@symbiote-native/css-parser` ONLY (never a `dependency`) — a
project that never authors `.scss`/`.less`/`.styl` must never be forced to
install any of the three, same reasoning as `postcss` being the one CSS
dependency that IS always required (§1). Each compiler function does a lazy
`await import('sass' | 'less' | 'stylus')`, cached in a module-scope variable
after the first successful load; a failed import throws a plain
install-instruction error (`"sass is required for .scss/.sass files. Install
it: npm i -D sass"`) instead of failing this package's whole module graph at
import time. `less` and `stylus` ship no types of their own, so `@types/less`
and `@types/stylus` are additional catalog-pinned devDependencies purely for
this package's own typecheck.

**Sync vs async — the whole transform chain went async, uniformly, including
plain `.css`.** SCSS/Less/Stylus compilation is inherently async in Node:
Less ships no synchronous render API at all, Stylus's callback-based render
must be Promise-wrapped, and Sass's `compileString` does have a sync API but
the lazy `import('sass')` step itself is still async either way. Every
existing transform function here was synchronous before this feature
(`compileCssFile`, `createCssMetroTransformer`'s `transform()`,
`metro-vue-transformer.js`'s `compileSfc`/`transform`) — first confirmed Metro
actually tolerates a Promise-returning `babelTransformerPath.transform()` by
reading the installed `metro-transform-worker` source directly
(`transformJSWithBabel` in its `index.js` already does `await
transformer.transform(...)` before touching the result — a supported,
exercised shape, not a hack we're relying on undocumented behavior for). Then
chose whole-chain-uniform-async over a sync-fast-path-for-`.css` fork: this
function only ever runs at Metro build time, content-hash-cached (never a
runtime hot path), so forking it into two shapes to save a single microtask
on the plain-CSS branch wasn't worth the duplication — one shape, documented
at each decision site (`metro-css-module.ts`, `metro-transformer.ts`,
`metro-vue-transformer.js`) rather than left implicit.

**The four wiring points that needed updating** (all documented at the call
site, not just here):

1. `metro-css-module.ts`'s `compileCssFile` — now `async`; detects the
   language via `detectLanguage()` and awaits `preprocessors.ts`'s `compile()`
   before `parseCSS()` runs. `isCssModuleFile()` was generalized from a
   literal `.module.css` suffix check to "does the extension-stripped
   basename end in `.module`" so `Card.module.scss` etc. scope exactly like
   `Card.module.css` always did. `globalClassNamesIn()` is now scanned
   against the COMPILED CSS text, not the raw preprocessor source — `:global(...)`
   isn't native SCSS/Less/Stylus syntax (each preprocessor passes an
   unrecognized selector through unchanged in practice), but scanning actual
   compiler output can't drift under nesting/interpolation the way assuming
   source-and-output stay textually identical could.
2. `metro-transformer.ts`'s `createCssMetroTransformer` — the extension check
   broadened from `.endsWith('.css')` to `preprocessors.ts`'s `isStyleFile()`
   (one shared recognized-extension list, so a new preprocessor extension is
   added in exactly one place); `transform()` is now `async`.
3. `metro-vue-transformer.js` — the `<style lang="X">` branch that used to
   throw for anything but plain CSS now maps `scss`/`sass`/`less`/`stylus` to
   a `compilePreprocessor()` call (still throws for any OTHER lang, a typo or
   genuinely unsupported value, unchanged message); `compileSfc` and
   `module.exports.transform` are both now `async`. The one wrinkle: an
   inline block has no real file path, so `.sass`'s indented-syntax
   selection (which `compileScss` picks off a `.sass`-suffixed path) needs a
   SYNTHETIC path (`` `${filename}.sass` ``) built from the `.vue` file's own
   name — every other preprocessor only uses the path for relative-import
   `dirname()` resolution, where the real `.vue` file path is correct as-is.
4. Every example's `metro.config.js` — `resolver.sourceExts` gained `'scss'`,
   `'sass'`, `'less'`, `'styl'` alongside the existing `'css'` entry.

Testing note (see `symbiote-sfc-style-compiler`'s own "verify this quickly"
practice above): `core/css-parser/src/preprocessors.test.ts` drives the REAL
installed `sass`/`less`/`stylus` packages (nesting, a variable, a mixin/
function, per language) rather than mocking them, since this is exactly the
kind of ported/adapted logic that can pass green against a mock while
silently diverging from the real compiler's actual output — the missing-
package error path is the one thing that IS mocked (`vi.doMock` + `vi.resetModules()`

- a fresh dynamic `import('./preprocessors.ts')` per case, so each test gets
  an isolated lazy-load cache instead of colliding with the "real compile"
  tests for the same language).

## 8. Standalone `.module.css` type safety — CLOSED (2026-07)

Two complementary mechanisms, both required — neither alone is sufficient,
matching the dual approach `@wolf-tui/typescript-plugin`'s own README
documents for the identical problem (a language-service plugin never loads
for a standalone `tsc`/CI run; an on-disk `.d.ts` alone can't give
live-while-typing feedback without a save-triggered regeneration step).

### `css-dts` — on-disk `.d.ts` generation, the `tsc`/CI-time source of truth

`core/css-parser/src/generate-dts.ts`'s `classNamesToDtsSource`/
`generateModuleDts` (pure, disk-free — reuses the real `parseCSS`/
preprocessor pipeline, so compound/descendant selectors and `:global(...)`
resolve exactly like `compileCssFile` does) plus `generate-dts-cli.ts` (the
disk-touching layer: walks a directory, finds every `.module.css`/`.module.
scss`/`.module.less`/`.module.styl`, writes `<file>.d.ts` next to each —
`Card.module.css.d.ts`, full original filename with `.d.ts` appended rather
than replaced, so TypeScript's own module resolution picks it up for
`import styles from './Card.module.css'` with no extra wiring). Unlike
Volar's `<style module>` intersection type (§ below), the emitted type has
**no index signature** — `styles.typoKey` is a genuine `error TS2339` under
`tsc`/`vue-tsc`, confirmed end-to-end against a real probe file in
`examples/react` (generate → `tsc --noEmit -p tsconfig.json` → the typo
error appears; delete the generated `.d.ts` → the loose ambient fallback
below takes over and the typo silently passes again).

Exposed as the `css-dts` bin from `@symbiote-native/css-parser`'s own `package.json`
— and, unlike `metro-css-parser.cjs`/the ViewConfig registration pattern,
**this is NOT re-exported through each adapter**. An app already types the
plugin's package name by hand in its own `tsconfig.json` (see below), so
requiring one extra `"@symbiote-native/css-parser": "workspace:*"` devDependency
line costs nothing extra over writing `@symbiote-native/react/typescript-plugin`
instead of `@symbiote-native/css-parser/typescript-plugin` — and it is MORE correct:
the plugin is pure dev tooling with zero adapter-specific behavior (same
`.cjs` file would otherwise be duplicated verbatim three times), and every
comparable community tool (`typescript-plugin-css-modules` etc.) is consumed
this same way, as a direct devDependency, never routed through a UI
framework's own package. Contrast with `metro-css-parser.cjs`: Metro's
`babelTransformerPath` is wired from a config file the app never edits by
name (`metro-css-transformer.js`), so hiding css-parser from the app's own
`package.json` there is the RIGHT call — an earlier version of this section
mirrored that indirection here too, tried it (adapter-level
`typescript-plugin.cjs`/`css-dts.cjs` shims), confirmed it worked, and then
reverted it once this asymmetry was pointed out: the two distribution
problems only LOOK identical, they don't share the same justification.
Wire `css-dts` as a `pretypecheck` script (`examples/vue-sfc/package.json`'s
`"pretypecheck": "css-dts ."`) — runs before every typecheck, local or CI,
with zero dependency on Metro/a dev server being up. `pretypecheck`/`preX`
is npm/pnpm's own generic convention (any `preX` script auto-runs before
`X` when invoked via `pnpm run X`/`npm run X`; verified live against this
repo's pnpm — it is NOT limited to npm's reserved lifecycle names), not
something this package wires itself. **Deliberately NOT wired into the
Metro transformer**: Metro's transform is content-hash-cached and only
touches a file actually reached by the CURRENT bundle graph, so a `tsc`/
`vue-tsc` run with no Metro involved (the normal CI shape) would find
`.d.ts` files missing or stale exactly where correctness matters.

**Current wiring state (2026-07), so a future session doesn't have to
re-discover it by grepping):** `pretypecheck` is wired ONLY in
`examples/vue-sfc/package.json` today — `examples/react`, `examples/vue-tsx`,
and `examples/angular` register the `typescript-plugin` in their
`tsconfig.json` but have no `pretypecheck`/`css-dts` script of their own yet,
a real parity gap per `<adapters_reach_full_feature_parity>`, not
deliberate. Separately: **no example app has an actual `.module.css` (or
`.module.scss`/`.less`/`.styl`) file today** — `find examples -iname
"*.module.*"` returns nothing repo-wide — so running `css-dts .` anywhere
right now is a real no-op (`css-dts: no .module.css (or .module.scss/.less/
.styl) files found`), by design of there being nothing to generate yet, not
a sign the tool is broken or unnecessary.

### `@symbiote-native/css-parser/typescript-plugin` — live in-editor autocomplete, zero watch process

A real TypeScript language-service plugin (`core/css-parser/
typescript-plugin.cjs`, subpath `@symbiote-native/css-parser/typescript-plugin`,
a DIRECT devDependency of each example — see the distribution note above for
why this one is NOT adapter-routed) registered via each example's
`tsconfig.json` `compilerOptions.plugins: [{"name":
"@symbiote-native/css-parser/typescript-plugin"}]`. Overrides
`getScriptSnapshot`/`resolveModuleNameLiterals` on the language service host
to synthesize a virtual `.d.ts` for a `.module.css` import — runs INSIDE the
IDE's own tsserver, recomputing on every keystroke the same way the rest of
tsserver already does. This is what makes "does the user have to keep a
terminal open" a non-question for live editing. (An earlier version of this
section said a `css-dts --watch` mode "was considered and rejected" for the
same reason — stale: `generate-dts-cli.ts` DOES implement `--watch` today, as
an opt-in convenience for keeping the on-disk `.d.ts` fresh during a long
local session. It doesn't compete with the plugin — the plugin needs no
watch process for the in-editor case regardless of whether `--watch` is
running, since `getScriptSnapshot` recomputes synchronously per keystroke on
its own.)

```
§ported_wolf_tui_typescript_plugin_bugs := {
  source: "wolf-tui/packages/typescript-plugin/src/index.ts
          (@wolf-tui/typescript-plugin) — reading source directly (not the
          README) surfaced 2 real bugs, fixed in our version",
  bug1: "class extractor never camelCases a kebab-case selector — its
        suggested key ('section-tight') doesn't match parseCSS's ACTUAL
        camelCased output (sectionTight — confirmed generating a real
        .d.ts from `.section-tight{}`)",
  bug2: "its .d.ts cache (Map<cssPath,dts>) never invalidates — stale
        autocomplete until tsserver restarts; ours keys on mtimeMs",
  also_found: "wolf-tui's package.json lists @wolf-tui/css-parser as a dep
              that index.ts never imports (abandoned direct-reuse
              attempt); wolf-tui/packages/typescript-plugin/src/{host-proxy,
              type-generator,css-resolver,
              language-service-enhancements}.ts (~900 lines) are dead —
              vite.config.ts's build.lib.entry points at index.ts alone",
}
```

**Scope, honestly recorded, not silently thinner:**

- Plain `.module.css` only — not `.module.scss`/`.less`/`.styl`.
  `getScriptSnapshot` must be fully SYNCHRONOUS (no async hook in the
  plugin protocol); Less and Stylus have no sync compile API at all (see
  §7), so a non-approximated preprocessor pipeline can't run here. Those
  files still get the loose ambient fallback + `css-dts`'s on-disk
  generation, just no live per-class completion in the plugin.
- Simple `.foo { }` selectors only — a compound (`.btn.primary`) or
  descendant (`.card .title`) selector, which the real parser merges into
  ONE key (`btnPrimary`/`cardTitle`), is extracted here as separate (wrong,
  non-existent) keys. Reusing the real parser would need importing this
  package's own ESM `parser.ts` from the plugin, which the CJS/ESM note
  below rules out; this is the SAME limitation wolf-tui's own README
  documents for its regex approach.
- Written as **hand-authored plain CommonJS** (`typescript-plugin.cjs` at
  each package's ROOT, not a compiled `.ts`/`.cts` under `src/`) — tsserver
  loads a plugin via a synchronous `require()`, which cannot load this
  package's own ESM build output without Node's newer synchronous-ESM-
  require support (stable only from Node 22.12, a floor neither this
  project's `engines.node: ">=20"` nor a user's editor-bundled Node
  guarantees). A `.cts` source was tried first and rejected: this package's
  shared tsconfig (`moduleResolution: "Bundler"`, needed for the rest of
  the package) doesn't apply the classic `.cts`→CJS format-forcing
  TypeScript otherwise gives Node16/NodeNext projects, and carving out a
  second tsconfig/project reference for one ~150-line file wasn't worth it
  — same `.cjs`-at-package-root shape as `metro-css-parser.cjs`.

Together: `css-dts`+`pretypecheck` is the correctness guarantee (CI, no
Metro, no IDE), the plugin is the live DX (editor only, zero terminal). A
loose `declare module '*.module.css' { const styles: Record<string,
string>; export default styles; }` ambient fallback lives in each example's
`css.d.ts` for a file that has neither yet.

**Why these two don't overlap — a general TypeScript fact, not something
specific to this plugin, worth knowing before assuming one makes the other
redundant.** `compilerOptions.plugins` in `tsconfig.json` is a
language-service-only extension point: only a running `tsserver` (the
process behind an IDE's live diagnostics/autocomplete) loads it. The
standalone `tsc`/`vue-tsc` CLI binary — which is what `pretypecheck` feeds
into, and what any CI typecheck job actually runs — reads the rest of
`tsconfig.json` but **silently ignores the `plugins` array entirely**; it
never spins up a language service at all. So `@symbiote-native/css-parser/
typescript-plugin` genuinely cannot catch a `.module.css` typo in a `tsc
--noEmit` / CI run, no matter how "automatic" it looks in the editor — it
is architecturally absent from that process. `css-dts`'s on-disk `.d.ts` is
the only thing a CLI/CI compile ever sees; the plugin only ever exists
inside a live editor session. Neither is optional if you want both "catch it
while typing" and "catch it in CI" — they're two different consumers of the
same underlying `.module.css` type problem, not two implementations of the
same fix.

## Explicitly open — NOT built, do not assume any of this exists

Per `<adapters_reach_full_feature_parity>`'s "record deferred scope honestly"
convention: these are real seams with a real path forward, not gaps silently
left thinner.

### `$style.card` autocomplete for inline `<style module>` — comes free from Volar, NOT from us; still no typo-catching

**Correction (2026-07, verified against a real `vue-tsc` run) — an earlier
version of this section claimed `$style.card` "type-checks as `string` with
no literal-key narrowing", which understated what actually happens for the
inline-SFC form.** Vue Language Tools (Volar, which `vue-tsc` shares its
virtual-file generation with) has its OWN built-in support for `<style
module>` blocks: it scans the block's raw CSS text for top-level class
selectors and synthesizes `$style`'s type as `Record<string, string> & {
row: string; badge: string; ... }` — entirely independent of
`@symbiote-native/css-parser`/the style-registry, using Volar's own naive selector
scan. This is why `$style.foo` autocompletes with the real class list in an
editor (confirmed via a real IDE screenshot hovering `$style` inside an
inline `<style module>` block) — it is a generic Vue SFC feature that also
happens to work for us, for free, because our transform keeps the exposed
object KEY identical to the original class name and only suffixes the
runtime VALUE (`row` → `"row__module__<scopeId>"`).

**It still does not catch a typo, confirmed by running `vue-tsc --noEmit`
against a real probe file** (`examples/vue-sfc`, temporary `.vue` with
`<style module>{.row{} .badge{}}` and a template reference to
`$style.typoKey`): zero diagnostics. Reason: the generated type is an
INTERSECTION with `Record<string, string>`, and that catch-all index
signature accepts any string key — so `$style.typoKey` still type-checks as
`string`, it just isn't one of the named literal properties. The practical
upshot is unchanged from before: a typo is a silent runtime miss (`$style`
resolving an unknown key to `undefined`), not a compile error — only the
"no autocomplete at all" half of the old claim was wrong.

**Unlike standalone `.module.css` (§8, CLOSED), this SFC-inline form is
STILL OPEN, and confirmed NOT WORTH CLOSING** — verified by reading
`@vue/language-core`'s own installed source directly rather than assuming a
config flag might exist. `generateStyleModules` in
`@vue/language-core/lib/codegen/style/modules.js` hardcodes the intersection
unconditionally:

```js
yield`: Record<string, string> & __VLS_PrettifyGlobal<{}`;
```

— no `vueCompilerOptions` flag gates it (grepped the package's `types.d.ts`,
nothing like a `strictCssModules` option exists), and it is called directly
from `codegen/script/template.js`, NOT through Volar's own pluggable
`vueCompilerOptions.plugins` codegen-extension point — so even Volar's own
supported customization mechanism can't override just this one function.
The only way to actually drop the index signature would be patching
`@vue/language-core` itself (pnpm `patch`/a fork), which breaks on every
Volar upgrade and isn't worth carrying for one string literal.

**Decision: don't chase this further.** The practical answer is already
shipped: use a standalone `Card.module.css` file + `import styles from
'./Card.module.css'` in the SFC's `<script>` instead of an inline `<style
module>` block — same CSS Modules semantics, and it goes through §8's
`css-dts`/`typescript-plugin` pair instead of Volar's, so a typo genuinely
fails `tsc`/`vue-tsc`. Inline `<style module>` keeps Volar's free-but-loose
autocomplete as documented above; nobody is patching Volar to fix it.

### Svelte

Svelte's `<style>` is scoped **by default** (opposite of Vue's opt-in
`scoped`), via an implicitly-injected `.svelte-hash` class rather than a
`data-v-hash` attribute, plus its own `:global(...)`. Symbiote has no Svelte
adapter yet (React, Vue, Angular only — see the other adapter skills) — this
is a forward-reference for whenever one is built, not actionable now. The
registry-scoping mechanism transfers directly once `scoped` exists for Vue;
only the SFC-syntax-extraction side (Svelte's own compiler) would differ.

### Tailwind CSS

Not built, and NOT a small extension of §7's preprocessor layer — Tailwind
needs whole-project class-name scanning and JIT utility generation, a
fundamentally different shape from "one source file reduces to plain CSS
text". Deliberately kept out of this compiler; being researched separately as
its own future package — see the `symbiote-tailwind-support` skill for the
current findings and the reasoning for why it doesn't fit here.

### `background-image` (gradients), `filter`, `transform-origin` — CLOSED (2026-07)

```
§bg_image_filter_transform_origin_closed := {
  claim: "whole family DONE — don't repeat the mistake of assuming any of it
         needs a Tailwind-style 'different mechanism'. Unlike @media/
         animation (genuinely no native RN concept), box-shadow, transform,
         filter, transform-origin, background-image/gradients are ALL real,
         fully-native Fabric style props on both platforms — confirmed by
         reading .vendors/react-native directly:
         BoxShadowPropsConversions.h/RCTBoxShadow.mm/BoxShadow.kt, filter's
         FilterPropsConversions.h, experimental_backgroundImage's
         BackgroundImagePropsConversions.h/.cpp, BackgroundImageDrawable.kt,
         LinearGradient.kt, Gradient.kt",
  fix: ["transform/box-shadow -> raw PROPERTY_TABLE entries; process-transform
        + process-box-shadow already existed/wired into commit.ts's
        STYLE_PROCESSORS — css-parser side was the only gap",
        "filter/transform-origin -> same pattern: process-filter.ts +
        process-transform-origin already ported/wired, PROPERTY_TABLE just
        missing the 2 raw entries",
        "background-image -> only one needing a NEW engine-level port:
        core/engine/src/process-background-image/index.ts (faithful port of
        RN's Libraries/StyleSheet/processBackgroundImage.js — linear/radial
        gradient parsing, color-stop transition-hint syntax, `at <position>`
        micro-grammar), wired into STYLE_PROCESSORS under key
        'experimental_backgroundImage' (RN's own prop name, not a plain
        kebab->camel rename), plus new IBackgroundImageValue family in
        core/engine/src/styles.ts"],
  bug_exposed: "examples/angular/App.css had ALWAYS authored box-shadow/
               filter/transform/transform-origin directly as CSS
               (.shadow-card, .filter-tile-dim, .rotated-card) since the
               Angular canary was written (not a migration). Before the
               PROPERTY_TABLE fix, every declaration was silently DROPPED
               by css-parser (deduped console.warn each) — Angular demo had
               rendered with NO shadow, NO dimming, NO rotation the whole
               time, nothing failing loudly",
  verified: "real Android simulator screenshot: blue glow, dimmed tile,
            rotated card all visibly correct, same session
            background-image shipped. New .gradient-card CSS class + demo
            section added to all 4 example apps (react/vue-sfc/vue-tsx/
            angular); all 4 confirmed rendering a correct gradient sweep on
            real iOS/Android simulators",
  scope: "React/vue-sfc/vue-tsx equivalent demos use inline dynamic style
         objects (shadowCardExtra/dimStyle/rotationStyle) instead of CSS
         classes for historical reasons predating <style scoped>/CSS-Modules
         — left as-is, not migrated, both forms equally valid now",
  open: "re-read commit.ts's STYLE_PROCESSORS + properties.ts's
        PROPERTY_TABLE before assuming this family needs work — closed
        incrementally in 3 passes across one session, an older 'not built
        yet' claim (incl. an earlier version of this section) can go stale
        within hours",
}
```

### 9. Cross-file class-name collisions in one app: the registry is flat and global, last-registered wins

`core/engine/src/style-registry/index.ts` is a single flat
`Map<string, IResolvedStyle>` **shared across every CSS/SFC-style-block source
in one app** — `App.css` plus every `components/*.css` (or `.vue`
`<style>` block) all call `registerStyles()` into the SAME namespace. There is
no per-file/per-component scoping unless the author explicitly opts into
`<style scoped>`/CSS Modules (see §4-6 above). Two files that both happen to
define `.pulse-dot` (or any other same-named unscoped class) silently
collide, and whichever one's `registerStyles()` call runs LAST wins — decided
by ES module import order (a module's own imports evaluate before its body,
in declared order), not by file position or "more specific wins" intuition.

```
§9a_appcss_stale_rules_2026_07 := {
  bug: "vue-sfc AND angular, same session — shared App.css had stale
       duplicate rules (.pulse-dot, .lead-dot, .ref-box, .section-header)
       predating per-component .css/<style> files, still carrying React's
       accent-blue hex instead of that framework's brand color",
  root_cause: "per-component styles already fixed to the right color, but
              App.ts/App.vue imports the full screen tree (pulls every
              component CSS) BEFORE ./App.css, so App.css's stale rules
              register LAST and silently overwrite the correct colors —
              ES import order, not file position",
  symptom: "screenshot-confirmed: React's blue chips/borders/buttons
           showing through the Vue/Angular canary, zero build error —
           registerStyles() has no duplicate-key diagnostic",
  lesson: "grep the WHOLE app (App.css + every components/*.css/<style>
          block) for a class name before fixing its color, not just the
          file being edited — recurs any time a shared top-level
          stylesheet and per-component stylesheets share a class name",
}

§9b_appcss_legacy_block_2026_07_10 := {
  bug: "examples/angular — `.section` (padding:24px, App.css shared/common
       block, used by every <SafeAreaView><View class=\"section\"> root)
       silently lost its padding on EVERY screen except CanaryScreen
       (uses ScrollView contentContainerStyle instead)",
  verified_live: "mobile_list_elements_on_screen: .section's direct
                 children at x:0 width:402 (full width, zero inset) vs the
                 same screen's nested hero-card correctly inset — proves
                 .section's OWN padding gone, not a measurement quirk",
  root_cause: "App.css still carried a full PRE-SPLIT legacy copy of every
              demo's styles (~230 lines, each with its own
              .section/.section-label re-declaration missing padding),
              never deleted after the components/*.css split (§9a only
              left 4 stray rules; this left ~230)",
  compounding_defect: "all 8 components/*.css files (AccessibilityDemo,
                       AnimatedDemo, AnimatedParityDemo, NativeModulesDemo,
                       ParityDemo, PlatformColorDemo, RefApiDemo,
                       ResponderDemo) ALSO independently re-declared
                       .section/.section-label/.info-text/.note-text/.row
                       with narrower values (e.g. .section{gap:12px}, no
                       padding) — each author reached for the obvious name
                       instead of checking it existed app-wide",
  detection: "static grep audit ('class exists in App.css' — yes, just
             redeclared) passed clean; only a live device element-tree
             read surfaced it",
  why_vue_react_immune: "React has NO per-component .css (reuses App.css
                        directly); Vue's <style scoped> is scoped by the
                        SFC compiler, can't leak into the global registry.
                        Angular's plain components/*.css has NO such
                        scoping ⟶ only adapter exposed to this bug shape",
  rule: "an Angular components/*.css file must NEVER redeclare a class
        already in App.css's shared/common section, even if values
        currently match",
  fix: "deleted the pre-split legacy block from App.css + every
       generic-utility redeclaration from the 8 component files (now
       inherit App.css's single definition)",
  verified: "ngc/tsc (blind to this bug class) + live device re-check —
            padding correctly x:24, width:354 everywhere",
  diagnostic: "don't trust 'class exists in App.css' as proof it renders
              correctly — grep for a SECOND definition anywhere in the
              app's CSS; symptom 'padding/spacing missing, no build error'
              ⟶ check the live device element tree, not just source",
}
```

## 10. Migrating the parse layer to lightningcss — decision and measurements (2026-08-19)

### Why: four silent, shipped bugs in one session

All four were found by accident while porting components, never by a test. Every one compiled
clean, registered, and produced a wrong screen or no rule at all:

| Bug                                             | Symptom                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| compound dead in both `__module__` forms        | `.badge.loud` never applied from a `.module.css` or a Vue `<style module>`              |
| compound-only token missing from the export map | `styles.loud` is `undefined`; the element carries the literal string "undefined"        |
| multi-value shorthand truncated                 | `padding: 8px 16px` → `{padding: 8}`; `1px 2px 3px 4px` → `{padding: 1}`                |
| `calc()` with `%`/`vw` truncated                | `calc(100% - 24px)` → `{width: 100}` — RN reads 100 POINTS, element renders ~100px wide |

The pattern is one thing, not four: a hand-rolled evaluator handles the cases it was written for
and mis-handles the rest **silently**, because the property is in `PROPERTY_TABLE` so nothing
reaches a `warnOnce`. The conclusion recorded here: **hand nothing to ourselves that a
battle-tested parser already does.**

### The decisive measurement — the visitor returns a TYPED value tree

Probed against the installed `lightningcss@1.32.0`, not from docs:

```
padding: 8px 16px        -> {top:8px, right:16px, bottom:8px, left:16px}   already expanded
margin: 1px 2px 3px 4px  -> {top:1, right:2, bottom:3, left:4}             already expanded
width: calc(100% - 24px) -> {calc: sum[percentage(1), dimension(-24px)]}   structured
color: grey              -> {type:'rgb', r:128, g:128, b:128, alpha:1}     resolved
flex-direction: row      -> 'row'
```

and `Rule.style` hands selector AST and declarations together, descending into `@media`:

```
.card.big > .title:hover
 -> [{class card},{class big},{combinator child},{class title},{pseudo-class hover}]
```

**Two of the four bugs above die by construction**: the shorthand never reaches us as a string,
and `calc` becomes an explicit "percentage minus length" we can refuse LOUDLY instead of
truncating to a number. That is why the pipeline consumes the **visitor**, not a text round-trip.

`cssModules: { pattern: '[local]__module__[hash]' }` reproduces our existing scoped-name shape
exactly, so the runtime's scope-tail parsing is unaffected; `:global(.reset)` stays unsuffixed and
`composes` is resolved into the exports map.

### What was rejected, and why — do not re-litigate without new evidence

| Option                                    | Why not                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-native-css` (nativewind) wholesale | its runtime is React-only; no CSS Modules, no scoped CSS; and it **silently drops** `>`/`+`/`~` with an empty `warnings()` because it has no parent pointers. We DO have a retained tree with `parent` — adopting it would lock us into a weaker model than our own architecture supports.                                                              |
| NativeWind                                | hard `tailwindcss` peer, v4 and v5                                                                                                                                                                                                                                                                                                                      |
| Unistyles                                 | does not parse CSS at all — a `StyleSheet.create` superset in C++/JSI. Its win is bypassing re-render, which our architecture already has.                                                                                                                                                                                                              |
| Stylo / `selectors` crate for the RUNTIME | **Hermes has no WebAssembly.** Verified: 0 hits in RN 0.84–0.87 release notes and in Hermes' own `doc/Features.md`; the only WASM-adjacent code is a 2021 asm.js path behind a custom-build flag, "unsupported, trusted code only" (facebook/hermes#429, still open). A Callstack webinar page claims otherwise — contradicted by every primary source. |
| Stylo standalone at build time            | 48 deps, `links=`, Gecko-shaped `ComputedValues`; Blitz needed ~140 KB of glue AND relicensed that glue crate to MPL. It would deliver a browser cascade we don't want.                                                                                                                                                                                 |

### The one thing no library can give us

**The matcher and the specificity ordering are ours on every path**, because the thing being
matched is a live Fabric node inside Hermes. A parser only ever answers "who reads the selector
string". lightningcss does not expose specificity (0 hits in its `.d.ts`), and
`@csstools/selector-specificity` is typed against postcss-selector-parser's AST, not this one —
so specificity is a small counting function over the visitor's selector AST. Counting, not parsing.

### Licence

lightningcss is **MPL-2.0**, we are MIT. Depending is fine — MPL copyleft is file-level (Mozilla
FAQ Q11) and nothing propagates to our files; the §3.2 source-availability duty is met by the
upstream npm tarball, and the parser never enters the app bundle. **Never vendor, copy, or patch
its sources** — a copied file becomes MPL. Port by reading behaviour, never by pasting. Same rule
for `selectors`/`cssparser` if their algorithms are ever used as reference.

### Staging, and the gate each stage must pass

A golden-snapshot harness pins today's emitted bytes over the real corpus plus 11 fixtures:
`core/css-parser/src/golden-corpus/`. It is proven non-vacuous (dropping `padding` from
`PROPERTY_TABLE` fails 38 named files; changing the module separator fails exactly the two
`.module.*` ones). **It pins today's behaviour INCLUDING the bugs above — that is deliberate.
Do not "fix" a snapshot.**

```
1   .module.css -> lightningcss cssModules     snapshot fails on .module.* ONLY, and every diff
                                               must be (a) hash algorithm, (b) value
                                               normalization, or (c) composes now resolved
1b  plain .css                                 snapshot fails only by value normalization
1c  Vue / Svelte transformers onto the SAME    their scope hash is SHARED with the template
    transform() call — one mechanism, three     rewriter — it must be read from `exports`, not
    `pattern` strings (below)                   recomputed, or styles and markup silently diverge
2   visitor instead of text + invert registry  postcss and postcss-value-parser leave the tree
3   specificity (a,b,c) + source order         replaces approximating the cascade by spread order
4   combinators                                moves resolution out of routeProp into the commit
                                               walk, because `parent` is only linked in appendChild
```

Stages 1c and 2 are the only ones that change a contract; 1/1b are byte-verifiable.

### Stage 1c in full: one transform(), three patterns

Decided 2026-08-20. Every scoping shape this repo has is the SAME operation with a different
suffix, so all of them are lightningcss's `cssModules` renaming — there is no second mechanism to
write:

```
standalone .module.*   pattern: [local]__module__<hash>      already migrated (stage 1)
Vue <style module>     pattern: [local]__module__<hash>
Vue <style scoped>     pattern: [local]__data-v-<hash>
Svelte <style>         pattern: [local]__svelte-<hash>       migrated 2026-08-20
```

**A SCOPED block must parse the ORIGINAL css and re-key it per token — NOT parse lightningcss's
renamed output, the way the `.module.*` path does.** Measured 2026-08-20: `parseCSS` camelCases
every class name, and a `-` before a letter is what it converts, so a scope tail whose base36 hash
starts with a LETTER is mangled — `card__svelte-p4np8c` registers as `card__svelteP4np8c` while
the markup carries the literal form. A single token survives that on the registry's kebab->camel
fallback; a COMPOUND does not (`tryCompoundLookup` reads the map directly), so every compound rule
in roughly half the files would silently die, and camelCasing the markup token to match instead
would kill scoped-base layering (`splitScopedToken` stops recognising the tail). `__module__<hash>`
only escapes this by having no `-` in its tail. `compileScopedCss`
(`core/css-parser/src/scoped-classes.ts`) is the seam that does it right: one `renameClasses` call
for the names, `parseCSS` + `classTokensIn` over the original for the values, and the collapsed key
rebuilt from the RENAMED tokens (`.card.big` -> `card__svelte-hBig__svelte-h`, which is what the
registry's raw-token compound path already builds).

The runtime needs no change: `SCOPE_TAIL_PATTERN` already accepts all three tails and `hashFilePath`
already feeds all three. What the migration DELETES is the point of it — both hand-rolled renaming
loops (`adapters/vue/metro-vue-transformer.cjs` ~line 191, `adapters/svelte/src/preprocessor/
scoped-styles.ts`) and the whole of `core/css-parser/src/global-selectors.ts`, which exists only
because postcss does not understand `:global()` and lightningcss's `cssModules` does.

What legitimately stays per-framework is the MARKUP rewriter — Vue edits `class`/`:class` in the
template AST, Svelte edits its markup, a standalone `.css` has no markup at all. The point is that
it stops being a second, independent implementation of "what is this class called now" and becomes
a reader of `exports`. That kills the entire bug class where the two halves computed the same name
differently.

**We deviate from vanilla Vue/Svelte scoping on purpose, and `cssModules` matches OUR scheme, not
theirs.** In a browser Vue scopes with an attribute selector (`.card[data-v-abc]` + a `data-v-abc`
attribute) and Svelte with a second class (`.card.svelte-abc`). RN has no CSS engine — no attribute
selectors, and the registry is a flat map keyed by ONE class token — so both would have nothing to
match. We rename the class instead, which gives the same isolation. Verified 2026-08-20 that the
cascade guarantee survives the rename:

```
registerStyles({ card:{padding:1}, 'card__data-v-aaaaaaaa':{margin:2}, 'card__svelte-bbbbbbbb':{margin:3} })

card                   -> {padding:1}
card__data-v-aaaaaaaa  -> {padding:1, margin:2}    own file layers over the global base
card__svelte-bbbbbbbb  -> {padding:1, margin:3}    another file's scope stays invisible
```

The one observable difference: the element carries one token instead of two, so a selector on the
bare scope marker (`.svelte-abc` alone) matches nothing. Only Svelte's own compiler writes those.

Order of work: the three end-to-end conformance tests (Vue / Svelte / standalone-CSS-per-adapter)
land FIRST — they are the net the migration falls into. Before them there was no proof any of these
forms worked end to end, which is how a compound rule stayed dead in both `__module__` shapes for
five days under a green suite.

Those three suites (Vue 21 / Svelte 19 / standalone 50 tests, all proven non-vacuous by real
breaks) found two things worth keeping even after the migration erases their cause.

**Vue `<style module>` was dead in a TEMPLATE, and a source comment said otherwise.** Measured
2026-08-20: `<template><View :class="$style.card"/></template>` + `<style module>` warns `Property
"$style" was accessed during render but is not defined on instance` and then throws `Cannot read
properties of undefined (reading 'card')` — the mount fails. The transformer emitted the map as a
module-scope `const`, and `metro-vue-transformer.cjs`'s own comment claimed it was "usable both
from the inlined template and from `<script setup>` code itself". Only the second half was true:
Vue's template compiler resolves a `$`-prefixed identifier off the component INSTANCE, from
`instance.type.__cssModules`, which nothing set (`.docs/framework-api-surface/vue.md:195` had
already recorded `__cssModules` as unset, but only about `useCssModule()` — nobody joined it to the
template path). `module="classes"` failed identically. No example app writes `$style` in a template,
so it shipped uncovered; the existing transformer test asserted the emitted const and the registry
map, never a mount. Same lesson as `.claude/rules/dotted-component-tags.md`: a capability claim in
a source header outlives the person who could have checked it — compile the two-line probe.

**The two export maps were mutually incompatible, which is the concrete cost of two renamers.**
Measured on identical CSS through `compileSfc` vs `compileCssFile`:

```
.card.loud        Vue <style module> -> key cardLoud__module__<h>;  map has cardLoud, NOT loud
                  standalone .module -> key card__module__<h>Loud__module__<h>; map has loud, NOT cardLoud
:global(.reset)   Vue                -> exported
                  standalone         -> not exported until fixed 2026-08-20 (see below)
composes          Vue                -> unhandled
                  standalone         -> composed-first token order
```

Both key shapes resolve — the collapsed one through `scopedCompoundKey`, the per-token one through
the raw `toCompoundKey` concatenation — so this was a NAMING divergence, not a second dead-compound
bug. But `styles.card + ' ' + styles.loud` written against a `.module.css` does not port to a Vue
`<style module>`, which needs `$style.cardLoud`. Unifying the renamer is what makes the two the
same contract.

**Two decisions about the export map that are ours, not CSS Modules'.** Both were made 2026-08-20
and both are supersets, so nothing that worked before stops working:

1. `:global()` names ARE exported, keyed as themselves with no scope suffix. lightningcss,
   css-loader and postcss-modules all omit them (nothing was renamed, so they have nothing to map).
   Omitting forces the author back to a bare `class="legacy-reset"` string literal, which throws
   away the typed `styles.x` access the map exists for.
2. Every key is camelCase — `exportLocalsConvention: 'camelCase'` in css-loader's vocabulary.
   lightningcss keeps the authored spelling, so a mixed map is the real hazard: `.legacy-reset`
   would key as `legacy-reset` while the `:global` backfill arrives already camelCased, and which
   spelling a class answers to would depend on which half of the compiler produced it. The VALUE
   keeps lightningcss's literal name; the runtime registry's own kebab→camel fallback resolves it.
   A collision (`.legacy-reset` and `.legacyReset` in one file) warns rather than silently
   overwriting.

The `.d.ts` generator must read its names from that same map — `moduleClassNames` in
`core/css-parser/src/metro-css-module/index.ts`. It used to derive them from `parseCSS` over the raw
source, and after the migration those two sets diverged, making the generated type wrong in BOTH
directions at once: `styles.cardBig` (a collapsed registry key naming no class) type-checked and was
`undefined` at runtime, while the valid `styles.big` was a TS2339.

Stage 4 is bigger than "unsupported": measured 2026-08-20, `.a.b` / `.a .b` / `.a > .b` /
`.a + .b` / `.a ~ .b` all compile to the SAME key `aB`, and colliding rules MERGE their
declarations rather than one winning. So a descendant rule never fires where it was meant to and
does fire where it was not — see the sixth trap in `.claude/rules/style-registry-collisions.md`.
Turn on `nonStandard: { deepSelectorCombinator: true }` in that stage and `>>>` / `/deep/` stop
being dropped as "Invalid dangling combinator" and arrive as `deep-descendant` / `deep`; Vue's
`::v-deep` and Angular's `::ng-deep` already parse as a pseudo-element between two descendant
combinators, and `:deep(...)` as a custom-function over a raw token stream. The flag is inert
before stage 4 — nothing consumes a combinator today.

### Runtime cost, measured before touching anything

`resolveClassName` has **no cache** and runs from `routeProp` on every class-prop set, per node.
Measured (Node/V8, 20k iterations, warmed, registry of 60 rules):

```
1 class                     0.09 us
2 classes                   0.58 us
3 classes                   1.89 us
4 classes (miss)           15.53 us     <- 60 candidate keys built and all missed
5 classes                   0.35 us     <- FASTER, because the compound branch is skipped entirely
```

The 5-class row is the tell: `parts.length <= COMPOUND_MAX_PARTS` is not a perf cap, it is a
silent correctness cliff. The inverted index (`Map<token, Rule[]>`) removes exactly the dominant
work — building 60 strings and missing 120 map lookups — and removes the cliff with it, because
nothing needs reversing. Re-run this benchmark after stage 2 so "faster" is a number.

### Stage 2 as decided 2026-08-20: no key normalization anywhere, keys as authored

The staging table above called stage 2 "visitor instead of text + invert registry". Measured that
day, it is bigger and simpler than that: **the key stops being DERIVED from the selector at all.**

Today's key comes from `extractClassName` — camelCase, drop what it does not understand, collapse
tokens into one string. Every lossy step maps two different selectors onto one key and the later
rule overwrites the earlier per property, silently, on every path (seventh trap in
`.claude/rules/style-registry-collisions.md`). lightningcss hands back everything that guessing
was reconstructing, so the pipeline becomes: css -> lightningcss AST -> our engine primitives,
with nothing in between. Probed against `lightningcss@1.32.0`:

```
padding: 8px 16px       {top:8px,right:16px,bottom:8px,left:16px}   4th trap gone — expansion is free
calc(100% - 24px)       typed sum [percentage 1, dimension -24px]   5th trap becomes warn+drop
color: red              {type:'rgb',r:255,g:0,b:0}
.card .title            [class, combinator 'descendant', class]     6th/7th become DATA
.card:hover[data-x]     pseudo-class 'hover' + attribute 'data-x'   droppable with a reason
```

Three consequences, all decided:

1. **Registry keys are the authored names** (`card-title`, plus whatever the scoping rename
   appended). The kebab->camel fallback in `resolveClassName` is not load-bearing: measured over
   `examples/` + `apps/`, 761 kebab class names in CSS and ZERO of them written camelCase in
   markup (the ten grep hits are JS identifiers). It stays only as back-compat.
2. **The export map / `$style` map keys are authored too** — `styles['card-title']`, not
   `styles.cardTitle`. This REVERSES decision 2 of "Two decisions about the export map" above:
   camelCase existed only to make dot access legal, and it merged `.legacy-reset` with
   `.legacyReset` into one key (hence the collision warn at `metro-css-module/index.ts:145`, which
   the reversal deletes rather than fixes). `classNamesToDtsSource`'s `formatKey`
   (`generate-dts/index.ts:18`) already quotes a non-identifier key, so `styles['card-title']`
   type-checks today with no generator change.
3. **A rule is `{tokens, specificity, order, style}` and the registry indexes `Map<token, Rule[]>`,
   matching when a rule's tokens are a SUBSET of the element's.** That deletes `toCompoundKey`, the
   permutation generator, `COMPOUND_MAX_PARTS` (a correctness cliff, not a perf cap) and
   `scopedCompoundKey`'s suffix factoring in one move, and gives stage 3 (specificity) for free
   because the AST carries it. `splitScopedToken` STAYS — scoped-base layering still needs it.

### `customAtRules` — the extension seam we have and have not used (measured 2026-08-20)

Measured on the installed 1.32.0, and the earlier "at-rules only" phrasing was too strong: what
cannot be extended is the GRAMMAR, but every extension point CSS's own tokenizer already tolerates
arrives as RAW TOKENS, and parsing them is ours to write.

```
.a:symbiote-platform(ios)   pseudo-class custom-function + token stream   parse it yourself
.a::symbiote-thing          pseudo-element custom                         same
.a:symbiote-flag            pseudo-class custom                           same
width: platform(ios,10px)   visitor.Function, arguments as tokens         same
@blue #056ef0;              Rule.unknown, prelude as tokens               same
@platform ios { … }         Rule.unknown — but the BODY NEVER ARRIVES     needs customAtRules
.a %% .b                    rule vanishes (errorRecovery ate it)          impossible
```

So `:global()` / `:deep()` are not special cases — anything shaped `:name(...)` / `::name` /
`name(...)` / `@name` reaches us. What is genuinely impossible is a new combinator or new
punctuation, which is exactly why `>>>` needed its own flag inside the Rust parser.

The trap: an UNDECLARED `@platform ios { .a { color: red } }` loses its whole body — the inner
style rule reaches no visitor at all. Declaring `customAtRules: { platform: { prelude:
'<custom-ident>', body: 'rule-list' } }` is what makes the body parse; prelude grammar is a CSS
syntax string (the `@property` grammar), body is `declaration-list` / `rule-list` / `style-block`.

The full visitor set (`node/index.d.ts:184-214`): StyleSheet · Rule · Declaration · Url · Color ·
Image · Length · Angle · Ratio · Resolution · Time · CustomIdent · DashedIdent · MediaQuery ·
SupportsCondition · Selector · Token · Function · Variable · EnvironmentVariable — plus a
`{ raw: '…' }` return that lightningcss re-parses into the AST, and `composeVisitors` for plugins.
`nonStandard.deepSelectorCombinator` covers `>>>` and `/deep/` ONLY; `::v-deep` / `::ng-deep` come
through as a custom pseudo-ELEMENT between two synthetic descendant combinators, and Vue's
`:deep(...)` as the custom-function form. All four measured, all four folded to one `deep`.

What the seam would buy SymbioteNative, none of it built yet: `@platform ios { … }` (a platform
branch expressed in CSS — today only `Platform.select` in JS), `@mixin`/`@apply` (the docs' own
example: a visitor stores the block in a Map, `@apply` inlines it — `composes` without a
preprocessor), `@theme` design tokens inlined at build. `addDependency({type:'file'|'glob'})` is
the matching cache-invalidation hook for anything such a rule pulls in from another file.

The cost, stated by the docs and worth respecting: a JS visitor makes compilation **~2x slower**
than the pure-Rust path. Build time only, per file, behind Metro's cache — but it means work
expressible as a table (`PROPERTY_TABLE`) must stay a table, never a visitor callback.

**`@platform ios { … }` is buildable today — verified end to end 2026-08-20.** The trap above is
only about leaving the rule UNDECLARED. Declared, it works:

```js
customAtRules: { platform: { prelude: '<custom-ident>', body: 'rule-list' } }
visitor: { Rule: { custom: { platform(rule) { /* rule.prelude, rule.body.value */ return []; } } } }
```
```
rule.prelude       {type:'custom-ident', value:'ios'}    typed, validated by the parser
rule.body.value    real style rules, declarations already expanded (padding -> 4 sides)
return []          strips the rule from the emitted css
```

So the block's contents flow through the SAME selector + declaration mapping as any other rule;
the at-rule contributes only a platform tag. At runtime it is not a per-node branch — register
only the branch matching `Platform.OS` at module eval, one `if` per file.

Two decisions to make when it is actually built, neither forced by lightningcss: whether the
prelude is one platform (`<custom-ident>`) or a list (`<custom-ident>+`), and how it cascades — a
rule inside `@platform` and its twin outside have EQUAL CSS specificity, so "the platform one
wins" has to come from registration order, not from the specificity triple.

**Why a per-platform CSS FILE is not the obvious alternative it looks like** (read before choosing
between `App.ios.css` and `@platform`). Measured in `metro-resolver@0.84.4`, `resolve.js:511`:

```
resolveSourceFile():
  1. resolveSourceFileForAllExts(context, "")   <- no platform arg: the EXACT path resolves first
  2. per sourceExt:  .<platform><ext>  ->  .native<ext>  ->  <ext>
```

So `import './App.css'` resolves at step 1 and `App.ios.css` is never even probed. Platform
variants only apply to an EXTENSIONLESS request (`import './App'`) — and there `sourceExts` lists
js/ts before css, so a sibling `App.tsx` wins the request instead (exactly the layout every
example app has). Making it work needs a basename no JS file shares (`app-styles.css` +
`app-styles.ios.css`, imported as `./app-styles`), which is no longer "the same as .ios.ts".

And a Vue/Svelte SFC `<style>` block cannot be split by filename at all — the component is one
file — which is where most of this repo's styling actually lives. That, not ergonomics, is the
argument for `@platform`: it reaches the surface the file split cannot. Neither is needed today
(no example carries a platform style delta); this exists so the trade-off is not re-derived.

### Four things the lightningcss visitor does that the docs do not say (measured 2026-08-20)

All four cost real debugging during the stage-2 wiring; none is guessable from the API surface.

**1. Under `cssModules`, the visitor sees the ORIGINAL class names.** The rename happens AFTER the
visitor walk. So one `transform()` yields both the authored tokens (from the AST) and their renamed
spelling (from `exports`) — the renamed CSS text never has to be parsed a second time, which is
what the old `.module.*` path did and what mangled a scope tail whose base36 hash began with a
letter.

**2. `:global()` does not disappear under `cssModules` — it CHANGES SHAPE.**

```
cssModules OFF  {kind:'custom-function', name:'global', arguments:[…raw token stream…]}
cssModules ON   {kind:'global', selector:[{type:'class', name:'reset'}]}   ← fully parsed
```

Handling only the raw form silently killed every `:global()` rule in a `.module.*` file — no
warning, an empty `.d.ts`, nothing registered. `:deep()` has NO such split (lightningcss implements
no `:deep()`, so cssModules has nothing to resolve): identical raw form in both modes.

**3. A style rule nested in `@media`/`@supports`/`@container` reaches `Rule.style` HOISTED OUT of
its condition.** Take it at face value and a `@media (min-width: 900px)` rule paints on every
phone — strictly worse than the old parser, which dropped it by never walking in. Returning `[]`
from the at-rule's own visitor removes it BEFORE the walk descends, which is how the rules inside
stay dropped; we warn once per at-rule kind so the loss is visible. `@keyframes` / `@font-face`
need no entry — neither emits a style rule.

**4. `errorRecovery: true` drops a malformed rule SILENTLY unless you read `result.warnings`.**
Found via a real incident: `examples/angular/src/screens/ApiPlaygroundScreen.css` opened with a
comment containing `.hero-*/`, whose `*/` closed the comment three lines early. Everything after it
was live CSS, so a garbage selector (the prose `… already exist in App.css` — where `App.css` reads
as a class `.css`) swallowed the real `.pg-subsection-label` rule after it. postcss "recovered" by
registering the garbage under a phantom key AND the real class; lightningcss dropped the whole
rule, taking the real class with it. Both were wrong; only the warning surface tells anyone. We now
funnel `result.warnings` through the same `warnOnce` as every other drop.

### Stage 2 landed — what the pipeline is now, and the numbers (2026-08-20)

```
STAGE   STATUS
1/1b/1c DONE   every scoping shape is one lightningcss cssModules rename
2       DONE   selector AST -> {tokens, specificity, combinators}; typed declarations ->
               engine primitives; registry keyed by TOKEN SET over an inverted index
3       DONE-BY-CONSEQUENCE  the compiler supplies real specificity and the registry already
               sorted by (a,b,c) -> epoch -> order, so the cascade landed with the wiring
4       OPEN   combinators ride along in the rule but nothing consumes them; real matching
               needs parent pointers, i.e. resolution moves into the engine's commit walk
```

The old path is GONE, not deprecated: `parser/index.ts` (postcss + `parseCSS` + `extractClassName`
and friends), `global-selectors.ts`, `renameClasses`, and in the engine `registerStyles`, the flat
map, `toCompoundKey`, the permutation generator, `COMPOUND_MIN/MAX_PARTS` and `scopeClassName`.
`postcss` and `postcss-value-parser` are out of the manifest and out of the repo's source entirely.
`splitScopedToken` STAYS — scoped-base layering still needs it.

Re-measured after the removal (20k warmed iterations, 60-rule registry, µs/op; cold uses a unique
filler token per iteration so the memo cannot answer):

```
            cold-hit  cold-miss  warm     |  BEFORE (flat map + permutations)
1 class       0.486     0.270    0.011    |   0.09
2 classes     0.562     0.302    0.015    |   0.58
3 classes     0.679     0.398    0.011    |   1.89
4 classes     0.801     0.497    0.011    |  15.53   <- the cliff
5 classes     0.881     0.571    0.012    |   0.35   <- faster than 4: the cap silently gave up
```

Cold is now flat and linear in token count, ~19x better on the 4-token miss, and 5 tokens costs
slightly MORE than 4 — which is the shape a correct implementation has. The old 5<4 inversion was
the tell that `COMPOUND_MAX_PARTS` was a correctness cliff, not a perf cap.

**One behaviour genuinely changed, and it is a fix.** A rule `.card__<S> :global(.reset)` against an
element carrying `card__<S> reset__<other>` used to resolve to `{}` — an artifact of the collapsed
key having no single suffix to factor out. Per-token rules match it now, which is also what the web
does (`class="reset svelte-other"` is matched by `.reset`). The inverse widening the old
`scopedCompoundKey` comment flagged as known-wrong — a foreign `reset` matching a fully-scoped
`.card.reset` — is gone with it.

**And one false green worth remembering.** `golden-corpus.test.ts`'s `PREAMBLE_LINE_SHAPES` decides
which emitted lines get snapshotted by matching each line and BREAKING at the first miss. Its
`/^registerStyles\(\{.*\}\);$/` stopped matching when the emitter switched to `registerRules([…])`,
so the registration line silently fell out of every SFC snapshot — 54 tests still green, covering
one line less. A filter that selects what to assert must be updated with the thing it selects, or
it degrades into asserting nothing.

**Sticky headers: was KNOWN-BROKEN on `feature/solidjs`, FIXED by the `feature/millionjs` merge —
and it was never a CSS regression.** The math lives in `e5f283c3` "keep sticky-header updates
linear as the window shifts" (alongside `84c04903` "skip untouched subtrees in the commit walk via
dirty marking"), both of which arrived with that merge. Kept as history because the failure shape
recurs: a canary built from a pre-merge `feature/solidjs` tarball shows it, and the misplacement
LOOKS like the rules pipeline. Check which commits the tarball was built from before spending a
debugging pass on CSS.

Merge overlap this predicted, for the record: both commits touch `core/engine/src/{commit.ts,
node.ts,index.ts}` and the stage-2 work touched `index.ts` (the `registerRules`/`IStyleRule`
exports, `registerStyles`/`scopeClassName` REMOVED from it) plus `styles.ts` — the conflicts landed
in the barrel, not in the walk.
