---
paths:
  - 'examples/*/App.css'
  - 'examples/*/components/*.css'
  - 'examples/*/src/**/*.css'
  - 'examples/*/**/*.vue'
  - 'examples/*/**/*.svelte'
---

# CSS in an example app — silent, build-clean traps

**Status after the lightningcss migration (2026-08-20).** Traps 2 (`var()` across files), 3
(compound in `.module.*`), 4 (multi-value shorthand), 5 (`calc()` with `%`), and 7 (colliding
derived keys) are CLOSED — the compiler reads lightningcss's typed AST, so a shorthand arrives
pre-expanded, an inexpressible `calc()` is dropped with a WARNING instead of a wrong number, and a
rule is keyed by its token set rather than by a string guessed from the selector. Trap 1 (one flat
registry shared app-wide) is by design and still live. Trap 6 (every combinator collapses into the
compound key) is still live and waits on stage 4. Each entry below keeps its original text — the
mechanism is the part worth remembering — with a status line where it changed.

`core/engine/src/style-registry`'s registry is one flat `Map` shared across
every CSS source in an app; a same-named class in `App.css` and a
`components/*.css` file collide silently, and whichever registers LAST
(import order, not file position) wins — no build error, no warning. Before
changing a class-tied style/color here, grep the WHOLE app for that class
name, not just this file. Full incident + mechanics: invoke the
`symbiote-sfc-style-compiler` skill (§9, "Cross-file class-name collisions").

**`var()` resolves only inside the file that declares the custom property.**
A component stylesheet writing `var(--mist)` against a token declared in
`App.css`'s `:root` registers the LITERAL STRING `"var(--mist)"` and ships it
to Fabric — build-clean, silently unpainted on device. Outside `App.css`, use
literals. Check with
`node -e "console.log(require('./core/css-parser/build/index.js').parseCSS(require('fs').readFileSync('<file>','utf8')))"`
— any `var(--…)` left in the output is a bug. Same skill, the section next to §5b.

## Third trap: a compound rule in a `.module.css` is DEAD — React, Angular and Solid

`.badge.loud` written in a **`.module.css`** never matches, silently. `<style scoped>` in a Vue
SFC or a Svelte component is fine; CSS Modules is not. So it hits every adapter with no SFC
scoping of its own.

Mechanism — the two scoping schemes have different SHAPES, and only one is recognised:

```
Vue / Svelte     card__data-v-1a2b3c4d      suffix matches SCOPE_SUFFIX_PATTERN
CSS Modules      card__module__1a2b3c4d     suffix is `1a2b3c4d`, base becomes `card__module`
```

`splitScopedToken` (`core/engine/src/style-registry/index.ts`) splits on the LAST `__` and tests
the tail against `/^(?:data-v|svelte)-[0-9a-z]+$/`. A module hash carries no such prefix, so the
token is read as UNSCOPED and contributes its whole name as a base. Registration collapses
`.badge.loud` to `badgeLoud__module__<id>` while the element carries two separately-suffixed
tokens — the two operations do not commute, which is the exact failure the `scopedCompoundKey`
comment says it fixed. It fixed it for the two suffix shapes it knows.

Not caught anywhere: `scoped-conformance.test.ts` covers `data-v-` (7 cases) and `svelte-` (8),
and `__module__` zero times. Measured 2026-08-19 while porting `CompoundClassDemo` to Solid.

**CLOSED 2026-08-20.** A rule now carries its token SET (`.badge.loud` -> `['badge','loud']`) and
the registry matches by subset, so there is no collapsed key to reconstruct and no suffix to factor
back out. A compound rule works in a `.module.*` exactly as it does anywhere else. Closing it is
not a pattern widening — the module shape has a double separator, so `splitScopedToken` needs to
recognise a second form, and the conformance test needs a third suffix column.

## Fourth trap: a multi-value `padding` / `margin` silently keeps only the FIRST value

```
padding: 8px 16px         ->  { padding: 8 }        16px gone
padding: 1px 2px 3px 4px  ->  { padding: 1 }        three values gone
margin:  5px 10px         ->  { margin: 5 }
```

Measured 2026-08-19 against the built `@symbiote-native/css-parser`. No warning fires — the
property IS in `PROPERTY_TABLE`, so `mapCSSProperty` never reaches its `warnOnce` path and
`convertValue` just parses the leading number and stops.

The cause is a stated assumption that is false. `core/css-parser/src/properties.ts`'s header says
RN's props "mirror CSS's shorthand model 1:1 … no shorthand expansion is needed". They mirror the
NAMES, not the VALUE GRAMMAR: RN's `padding` takes one number, while CSS's takes one to four with
box-model semantics (1 = all, 2 = v/h, 3 = t/h/b, 4 = t/r/b/l). Expansion into
`paddingTop/Right/Bottom/Left` genuinely is needed and does not happen.

**CLOSED 2026-08-20 — lightningcss hands the shorthand back pre-expanded as a Rect, so the
compiler emits the four longhands (or the single RN shorthand when all four sides match). Write
either form.** The historical guidance, kept because the files still read this way: `examples/{react,vue-sfc,svelte,angular}`
already carry ZERO multi-value shorthands; `examples/solid/App.css` carried ten and was losing
horizontal padding on screen. `apps/docs-site` is unaffected — that is a real browser, not this
parser.

## Fifth trap: `calc()` with a percentage or viewport unit silently becomes a POINT value

```
width: calc(100% - 24px)   ->  { width: 100 }    % and the subtraction both gone
width: calc(50% + 10px)    ->  { width: 50 }
width: calc(100vw - 32px)  ->  { width: 100 }    vw gone
width: calc(2rem * 2)      ->  { width: 64 }     correct — rem*scalar does work
width: 100%                ->  { width: "100%" } correct — a bare percentage is fine
```

RN reads `width: 100` as one hundred POINTS. An element authored as "full width minus a gutter"
renders ~100px wide. Visible on screen, not subtle — and no warning, because the property is in
`PROPERTY_TABLE` and the narrow evaluator returns a number rather than failing.

Measured 2026-08-19 against the built `@symbiote-native/css-parser`. Same silence class as the
shorthand trap above: the evaluator handles the cases it was written for (`rem` times a scalar)
and quietly mis-handles the rest.

**CLOSED 2026-08-20 — as a WARNING, not as support.** RN cannot express "percentage minus
length", so the declaration is now dropped and the author told, instead of silently emitting the
wrong number. Still express "fill minus gutter" with flex or parent padding; a bare `100%` is
safe, and `calc()` over one unit (`calc(1rem + 2px)`) now evaluates correctly.

## Sixth trap: every combinator collapses into the compound key, and the rules MERGE

```
.a.b    { … }  ->  aB     compound  — correct
.a .b   { … }  ->  aB     descendant
.a > .b { … }  ->  aB     child
.a + .b { … }  ->  aB     adjacent
.a ~ .b { … }  ->  aB     sibling
.a >>> .b, .a /deep/ .b   ->  aB
.a :deep(.b), .a ::v-deep .b  ->  {}   dropped whole (unknown pseudo)
```

Five different selectors compile to ONE key, so the runtime matches all of them as "one element
carrying both classes". A descendant rule therefore never fires where it was meant to and DOES
fire where it was not. Worse, the keys collide and the declarations are merged, not overwritten:

```
.card .title{color:red} .card.title{color:blue} .card > .title{font-size:9}
  ->  { cardTitle: { color: "blue", fontSize: 9 } }
```

Measured 2026-08-20 with `parseCSS`. Nothing warns — the collapse is the parser's own
compound-key path, doing exactly what it was written for on selectors it was never taught to
tell apart.

So today: write compound (`.a.b`) freely, write a descendant/child/sibling rule NEVER — give the
child its own class instead. Vue's `:deep()` and `::v-deep` and Angular's `::ng-deep` are dropped
silently, which is at least visible as "no style at all".

Fixing this is the stage-4 item in `symbiote-sfc-style-compiler` §9: real matching needs parent
pointers, so resolution moves out of `routeProp` into the engine's commit walk. lightningcss
hands back the combinator in the selector AST for free (`{type:'combinator', value:'child'}`), and
`nonStandard: { deepSelectorCombinator: true }` turns `>>>` / `/deep/` from a dropped rule
("Invalid dangling combinator") into `value:'deep-descendant'` / `'deep'`; `::v-deep` / `::ng-deep`
already arrive as a plain pseudo-element between two descendant combinators, and `:deep(...)` as a
custom-function whose argument is a raw token stream. Enable the flag when that stage lands, not
before — there is nothing to consume it until then.

## Seventh trap: the registry key is DERIVED from the selector text, so distinct rules collide

The key comes from `extractClassName` (`core/css-parser/src/parser/index.ts`), which camelCases,
drops what it does not understand, and collapses tokens. Every lossy step maps two different
selectors onto ONE key, and the later rule's declarations overwrite the earlier per property —
silently, in a scoped `<style>` (Svelte/Vue) as much as in a plain `.css`. Measured 2026-08-20
through `compileScopedCss`:

```
.card-title{color:red} .cardTitle{color:blue}  ->  cardTitle {color:blue}      red rule GONE
.card:hover{color:red} .card{color:blue}       ->  card      {color:blue}      the :hover rule GONE
.card[data-x]{color:red}                       ->  "card[dataX]"              key matches nothing, dead
.a.b{…} .b.a{…}                                ->  aB and bA                  two keys, one rule pair
```

Only the `.module.*` EXPORT map warns on the camelCase collision
(`metro-css-module/index.ts:145`) — the style keys never do, on any path.

So: never write two classes in one file that differ only by kebab-vs-camel spelling, and never
rely on a pseudo-class or attribute selector carrying its own declarations. The fix is structural
— key by TOKEN SET from lightningcss's selector AST instead of by a string built from the
selector text (stage 2 in `symbiote-sfc-style-compiler` §9).
