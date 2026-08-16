---
name: svelte-adapter-custom-renderer
description: "Symbiote Svelte adapter - driven by Svelte's OFFICIAL custom-renderer API (svelte/renderer, sveltejs/svelte#18042), which fully replaced the earlier DOM-shim strategy on 2026-08-16 (see svelte-adapter-dom-shim, now superseded). Read BEFORE writing any adapters/svelte/**, packages/*/src/svelte/**, or packages/navigation/src/svelte/** code, before touching svelte.config.js / metro-svelte-transformer.cjs, and before bumping the `svelte` dependency off its current git-commit pin. Covers: the git-dependency pin on sveltejs/svelte's `svelte-custom-renderer` branch (PR still unmerged/unreleased - no npm release ships this API yet) and why `require('svelte/compiler')` fails under it (must be dynamic `import()`); the Renderer interface shape and renderer.ts's implementation over @symbiote-native/engine; the MODULE-LEVEL SINGLETON design (not per-mount factory - the compiled component itself auto-imports and pushes the renderer, measured directly against the compiler) and setActiveSurface; per-prop attribute spreading (`{...rest}`) replacing the old object-bag (`p={bag}`) - is_custom_element is now forced false, so symbiote-* tags no longer need the custom-element workaround; `{@attach (node) => ...}` replacing `bind:this` (bind: on any element is now a HARD COMPILE ERROR, no exception for `this`); the on-prefixed-value-prop trap (`onTintColor`, Switch's real iOS prop name, misrouted to addEventListener by the compiler's/runtime's on-prefix-is-always-an-event rule - same trap for both literal AND spread attributes, confirmed against the real compiled output) and its ON_PREFIXED_VALUE_PROP_UNMANGLE remap table; what the compiler now rejects at compile time for free (bind:, transition:/animate:/in:/out:, <svelte:head|window|body|document>, {@html}) eliminating the old forbid-web-only-constructs.ts preprocessor; eager node binding (no more lazy ShimElement, no more template-clone dance - a custom renderer never clones); the UNIVERSAL `style`-key template-attribute corruption (§11, toTemplateSafeProps - Svelte's `to_style()` stringifies any non-template-tracked style value, hits almost every component, literal attributes too, not just spreads); the `mountDescriptorChildren`/`hostProps` missing-commit bug pattern (§10, requestActiveCommit - a JS-only engine mutation outside a Renderer wrapper method never triggers Fabric commit on its own); and the `{@attach}` double-fire (§12 - Svelte's own compiled spread already auto-invokes forwarded attachments, so createAttachmentsSync is now redundant almost everywhere, but NOT in files whose own prop-forwarding drops symbol keys before the spread). MIGRATION COMPLETE 2026-08-16: 173/177 tests green across adapters/svelte + packages/navigation/svelte + packages/slider/svelte; §13 lists the 4 remaining known-narrow failures (react-native-screens stack push/pop, one createTunnel timing case). Trigger on: 'svelte adapter', 'svelte custom renderer', 'push_renderer', 'symbiote-view spread', on-prefixed prop collision, style corrupted to string, attach fires twice, bumping svelte, or issue #47."
---

# Symbiote Svelte adapter - the official custom-renderer API

## Status (2026-08-16) - migration COMPLETE, 173/177 (98%) green

The full migration off the DOM shim landed the same day it started: `adapters/svelte/**`,
`packages/navigation/src/svelte/**`, and `packages/slider/src/svelte/**` are ALL on the official
custom-renderer API now. The old DOM-shim directory (`adapters/svelte/src/dom-shim/`),
`root-element.ts`, and the whole `preprocessor/forbid-web-only-constructs.ts` guard are DELETED.
`svelte-adapter-dom-shim` is marked superseded.

`npx vitest run adapters/svelte packages/navigation/src/svelte packages/slider/src/svelte`:
**173 passed / 4 failed** (177 total). `tsc --build` is clean in `adapters/svelte`,
`packages/navigation`, and `packages/slider`. §13 lists the 4 known-open failures - all narrow,
all in ONE feature (react-native-screens stack push/pop imperative mechanics + one createTunnel
cross-surface timing case), not architectural gaps in the renderer itself.

**Four real, non-obvious bugs were found and fixed DURING the migration** (each one shared across
many components/files, not narrow to whatever file first exposed it) - §§6, 10, 11, 12 below:
the on-prefixed-value-prop trap (`onTintColor`), the `mountDescriptorChildren` missing-commit gap,
the universal `style`-key template-attribute corruption, and the `{@attach}` double-fire. Read
those four before touching ANY file in this adapter - they are the sharp edges most likely to
bite a change that looks correct at a glance.

## §0. Why this replaced the DOM shim

Read `svelte-adapter-dom-shim` (now marked superseded) for the original decision record - it is
still useful background on WHY a shim was chosen in the first place (the PR was unmerged, no
released Svelte exposed the API). Nothing in that reasoning changed; what changed is that this
project decided to build against the still-unmerged PR directly, on a temporary git-commit pin,
rather than continue waiting. See `pnpm-workspace.yaml`'s `svelte:` catalog entry for the pin and
its rationale.

**The single most important mechanism, confirmed by actually compiling a probe component and
reading the output (not assumed from the PR's own test suite):**

```
"svelte": "github:sveltejs/svelte#<commit>&path:/packages/svelte"
```

pnpm's git-dependency `path:` fragment syntax (confirmed supported, `pnpm.io/package-sources`).
The checked-out source needs NO build step: `main`/`module`/`./renderer` all point at raw
`src/*.js` (plain ESM, Metro/Node load it directly), and `types/index.d.ts` is committed (not
gitignored) despite most of `types/` being generated - verified by listing the package tree on
the pinned commit.

**One real gap this creates:** the package ships NO prebuilt `compiler/index.js` (that is
`rollup -c`'s output, a `build` script artifact we never run). `svelte`'s own `package.json`
`exports["./compiler"].require` points at that missing file, so **`require('svelte/compiler')`
throws `MODULE_NOT_FOUND` under Node/Metro's CJS resolution.** `import('svelte/compiler')`
(dynamic, even from a `.cjs` file) resolves fine via the `default` condition
(`./src/compiler/index.js`, real ESM source). `metro-svelte-transformer.cjs` uses a lazy
`compiler()` promise for exactly this reason - do not revert to a top-level `require`. Re-check
this the moment the pin moves to a real npm release (which ships the built bundle).

## §1. The Renderer interface, measured

`svelte/renderer`'s `createRenderer(renderer)` is an identity function - `(r) => r`, pure type
inference, no hidden factory logic. The `Renderer<TFragment, TElement, TTextNode, TComment>`
type it validates against:

```ts
{
  createFragment(): TFragment;
  createElement(name: string): TElement;
  createTextNode(data: string): TTextNode;
  createComment(data: string): TComment;             // used as a positional anchor, not necessarily rendered
  nodeType(node): 'fragment' | 'element' | 'text' | 'comment';
  getNodeValue(node: TTextNode | TComment): string | null;
  getAttribute(element: TElement, name: string): string | null;
  setAttribute(element: TElement, key: string, value: any): void;   // value is UNTOUCHED - no stringification
  removeAttribute(element: TElement, name: string): void;
  hasAttribute(element: TElement, name: string): boolean;
  setText(node: TElement | TTextNode | TComment, text: string): void;
  getFirstChild(element: TElement | TFragment): node | null;
  getLastChild(element: TElement | TFragment): node | null;
  getNextSibling(node: TElement | TTextNode | TComment): node | null;
  insert(parent: TElement | TFragment, element: node, anchor: TElement | TTextNode | TComment | null): void;
  remove(node: TElement | TTextNode | TComment): void;
  getParent(node): node | null;
  addEventListener(target: TElement, type: string, handler, options?): void;
  removeEventListener(target: TElement, type: string, handler, options?): void;
}
```

This is the SAME shape Vue's `RendererOptions` and Angular's `Renderer2` give us - a structural
node-op seam, no DOM vocabulary required. Svelte's own reference implementation for testing
(`packages/svelte/tests/custom-renderers/renderer.ts` on the PR branch) targets a plain
object-node tree with no DOM at all - proof this is meant to be implemented exactly the way we
did: over an arbitrary retained tree, here `@symbiote-native/engine`'s `ISymbioteNode`.

**`ISymbioteNode` already carries `parent`/`children`** (`core/engine/src/node.ts`), so
`renderer.ts` needs almost no extra tree bookkeeping for real elements - `getFirstChild`/
`getNextSibling`/`getParent`/`insert`/`remove` mostly delegate straight to the engine's own
`appendChild`/`insertBefore`/`removeChild` and read the SAME node's `.children`/`.parent` back.
The only bookkeeping renderer.ts owns itself is for **fragments** (Fabric has no fragment
primitive - `IFragmentNode` is a plain, engine-invisible `{ children, parent }` container that
`insert()` flattens into a real parent, matching the DOM spec rule "inserting a fragment inserts
its children, leaves the fragment empty") and a `fragmentParentOf` WeakMap tracking a real node's
LOGICAL parent while it sits inside an as-yet-uninserted fragment (mirrors `node.ts`'s own
`classStyleParts` WeakMap pattern rather than mutating engine-owned node shape).

## §2. No more clone-on-write dance - nodes are created fresh, always

**The single biggest simplification versus the DOM shim.** Measured directly (compiling a probe
and reading `from_tree`'s compiled call, plus the PR's `template.js` diff): under a custom
renderer, `from_tree`'s clone step is skipped ENTIRELY - `document.importNode`/`cloneNode` are
never called; `clone_node`/`import_node` in `operations.js` both throw
`"... is not supported with custom renderers"` if a renderer somehow reached them. Every
`createElement`/`createFragment`/`createTextNode`/`createComment` call happens FRESH, once, per
real mount - there is no "template built once, then cloned per instance" prototype tree to dodge.

This DELETES the entire "§9: the engine node must be lazy" design from the old shim skill.
`renderer.ts`'s `createElementNode` binds the engine node **eagerly**, at creation time
(`toPublicInstance(engineCreateElement(...))`) - there is no more "not live yet" state, no more
`ShimElement.engineNode: ISymbioteNode | undefined`, no more `makeLive()` tree walk. A
`{@attach}` on a host tag (§4) hands back the real, already-measure/focus/setNativeProps-capable
node the instant it fires.

## §3. The renderer is a MODULE-LEVEL SINGLETON - not a per-mount factory

**Counterintuitive and load-bearing; get this wrong and nothing ever commits.** The obvious
design - a `createSymbioteRenderer(surface)` factory closing over each mount's own surface, so
`requestCommit()` always targets the right one - is WRONG, and was caught only by actually
compiling a probe component and reading the generated code, not by reading the PR's own
docs/tests (which use one static renderer per test file and never surface this).

**What actually happens:** passing `experimental.customRenderer` as a STRING module specifier
makes the COMPILER embed `import $renderer from '<that specifier>'` and
`$.push_renderer($renderer)` **at the top of every compiled component's own function body** -
confirmed by compiling `<symbiote-view onPress={fn} {@attach ...}>` and reading:

```js
import $renderer from '@symbiote-native/svelte/renderer';
...
export default function Probe($$anchor, $$props) {
	var $$pop_renderer = $.push_renderer($renderer);
	...
	$$pop_renderer();
}
```

Every component we compile therefore ALWAYS uses `renderer.ts`'s default export, regardless of
what `render.ts`'s `mount()` call passes as `{ renderer }` (push/pop is a stack; the component's
own innermost push wins for the duration of its own body). A per-mount factory's renderer object
would simply never be the one Svelte actually calls.

**The fix:** `renderer.ts` exports ONE renderer instance (`symbioteRenderer`, also the module's
`default` export so the `experimental.customRenderer` module-path string resolves to something
real for tooling - svelte-check's own JSDoc says the module's default export must be a
`createRenderer()` result). `requestCommit()` reads a module-level `activeSurface` variable that
`render.ts`'s `mount()`/`unmount()` set via `setActiveSurface()` - the SAME single-root-per-
process invariant the old shim's `patchGlobals()` singleton relied on, just one variable instead
of nine patched globals. `render.ts` still ALSO passes `{ renderer: symbioteRenderer }` to
`mount()` explicitly, for defensive correctness (matches the documented API contract even though
the compiled component's own auto-push is what actually wins).

**Do not "fix" this back to a factory.** If a future refactor reintroduces per-mount renderer
instances, re-verify against a real compiled probe before trusting it - the compiled-output
behavior is the ground truth here, not the interface types.

## §4. `{@attach}` replaces `bind:this` - `bind:` on any element is now a compile error

Measured against the real `BindDirective.js` diff, not inferred: the `custom_renderer` guard
throws `` `bind:` is not compatible with `customRenderer` `` for ANY `bind:` directive whose
parent is `RegularElement`/`SvelteElement`/`SvelteWindow`/`SvelteDocument`/`SvelteBody` -
**unconditionally, before the compiler even checks `node.name === 'this'`.** There is NO
exception for `bind:this`. (Component-level `bind:` via `$bindable()` - e.g. app code writing
`<TextInput bind:value>` - is a completely different code path, untouched, still fully
supported.)

The replacement, confirmed to compile and work: an element-level `{@attach}` directive.
`{@attach}` is not touched anywhere in the PR's diff (grepped the full changed-file list) - it
compiles on both components AND regular elements exactly like on released Svelte, and its
runtime (`svelte/internal/client`'s `attach()`) just calls the function with whatever node the
renderer created, with no DOM assumptions. The idiom every component uses now:

```svelte
<script lang="ts">
  import type { IHostInstance } from '@symbiote-native/engine';
  let hostRef = $state.raw<IHostInstance | null>(null);
</script>

<symbiote-view {...rest} {@attach (node) => (hostRef = node)}>
```

`hostRef` is the REAL `ISymbioteNode` (already `toPublicInstance`-augmented - measure/
measureInWindow/measureLayout/setNativeProps/focus/blur are already on it), not a wrapper. Every
place that used to read `hostShim.engineNode` now just uses `hostRef` directly -
`host-instance.ts`'s `hostInstance()`/`findNodeHandle()` collapsed to thin passthroughs over
`ISymbioteNode` for exactly this reason.

**`runes/attachments.ts`'s `createAttachmentsSync()` is now DEAD in most call sites - see §12.**
An earlier draft of this section said it was unaffected; that was wrong, corrected 2026-08-16
once it was confirmed Svelte's own compiled spread handling ALREADY auto-invokes every
`{@attach}`-tagged symbol it finds in whatever gets spread onto an intrinsic. `createAttachmentsSync`
is still load-bearing in the handful of components where the forwarded `props` object never
actually reaches the host tag's own spread (§12 lists them) - check that section before assuming
either "always needed" or "always dead" for a given file.

## §5. Per-prop attributes replace the object bag - `is_custom_element` is now forced false

Measured against `RegularElement.js`'s diff: `const is_custom_element = is_custom_element_node(node) && !custom_renderer;`
- under `custom_renderer`, EVERY element (hyphenated or not) is treated as an ordinary element,
never a DOM custom element. This deletes the entire reason the object-bag design existed
(§3g of the old skill): `set_custom_element_data`'s stringify-vs-property-set branching, the
`customElements` stub, the "`style` is hard-excluded and always stringified" hazard - all of it
was DOM-custom-element-specific machinery that a custom renderer simply never enters. Every
attribute - INCLUDING `style` - now goes through the ordinary `set_attribute`/`attribute_effect`
path, i.e. straight to `renderer.ts`'s `setAttribute`, i.e. straight to `routeProp`, untouched,
typed, exactly like Vue's `patchProp(el, key, prevValue, nextValue)`.

**The new idiom, component by component:** delete the "assemble everything into one `bag`
object" step; spread the resolved props object directly onto the intrinsic:

```svelte
<!-- BEFORE (retired) -->
<symbiote-view p={bag} bind:this={hostShim}>

<!-- AFTER -->
<symbiote-view {...rest} {@attach (node) => (hostRef = node)}>
```

Per-key diffing (old §3g(c)'s "mandatory, not an optimization" caveat) is now Svelte's own job -
`attribute_effect`'s spread path (`dom/elements/attributes.js`) DOES have proper prev/next
per-key comparison; the old shim's manual diff existed only because `set_custom_element_data` had
none. Nothing to hand-roll here anymore.

**A JS-only imperative tree builder (`descriptor-to-svelte.ts`) is DIFFERENT - it never goes
through template compilation at all**, so it is not subject to anything in this section or §6. It
calls `routeProp` directly against real engine nodes it builds itself
(`createElementNode`/`createTextNodeOp` from `renderer.ts` + `engineAppendChild`), the same way
React's flat bag and Vue's `patchProp` already do - this is how a downstream third-party-view
package (`packages/slider`) mounts a Descriptor whose `type` is a raw, non-`symbiote-`-prefixed
Fabric name that cannot be written as a literal template tag.

## §6. The on-prefixed-value-prop trap - `onTintColor`, and the general rule

**Confirmed on the real compiled output, for BOTH literal attributes and spread props - this is
the one place the per-prop redesign genuinely loses something the object bag had for free.**

Svelte's compiler/runtime treat ANY attribute whose name matches `on[A-Z]` as an event,
UNCONDITIONALLY, by NAME ALONE - with no runtime awareness of whether the target component
actually has an event by that name (unlike `routeProp`'s `isEventFor(node.component, name)`
check, which every OTHER adapter's flat-bag/patchProp path gets for free). Two independent code
paths both do this, confirmed by reading BOTH:

1. **Literal template attributes** (`onPress={fn}`) - a COMPILE-TIME check,
   `is_event_attribute = name.startsWith('on')` (`compiler/utils/ast.js`), routes straight to
   `$.event(...)`.
2. **Spread attributes** (`{...rest}`) - compiles to a GENERIC RUNTIME dispatcher,
   `$.attribute_effect(element, () => ({...rest}))`, whose implementation
   (`dom/elements/attributes.js`'s `set_attributes`) does `var prefix = key[0] + key[1]; if
   (prefix === 'on') { /* event handling via create_event */ }` - the SAME name-only check, just
   evaluated at RUNTIME over the spread object's keys instead of compile-time over template
   source. **Confirmed by compiling a `{...rest}` spread containing both a real handler and
   proved this branches identically to the literal-attribute case.**

`render-switch.ts` (`core/components`, shared framework-agnostically across every adapter)
already documents the field that collides: iOS's REAL native Switch prop is spelled
`onTintColor` (UISwitch's own API - see `switch-platform.ios.ts`), a plain color-string VALUE,
never a handler. Every other adapter routes it fine at RUNTIME via `routeProp`'s `isEventFor`
check. Under Svelte's custom renderer, `onTintColor={color}` (or riding inside a spread) gets
INTERCEPTED as an event before it ever reaches `setAttribute`/`routeProp` - the color value is
silently swallowed (treated as if it were a handler `.apply()`-called later, never actually
invoked since no `'TintColor'`-named native event exists), and Fabric never receives the real
prop.

**A 2026-08-16 audit of every `core/components/src/view/render-*.ts` and `state/*.ts` for an
on-prefixed key typed as a non-function value found exactly ONE case: `onTintColor`.**
(`onLayout`/`onChange`/etc. are all genuine handlers and route correctly through this same path,
by design - the compiler's blunt on-prefix rule happens to be RIGHT for the overwhelming common
case; `onTintColor` is the one accidental collision.)

**The fix, `renderer.ts`:**

```ts
export const ON_PREFIXED_VALUE_PROP_UNMANGLE: Readonly<Record<string, string>> = {
  symbioteValueOnTintColor: 'onTintColor',
};
export function remapOnPrefixedValueProps(props): Record<string, unknown> { /* real -> template-safe, forward direction */ }
// setAttributeOp reverses it (realPropName()) right before routeProp.
```

`components/switch/index.svelte` calls `remapOnPrefixedValueProps(descriptor.props)` before
spreading - renaming the ONE colliding key to a `sy`-prefixed name the compiler's `on`-prefix
check does not match - and `setAttributeOp` un-renames it right before `routeProp`. **If a future
component's `renderX()` output introduces a new on-prefixed VALUE prop (not a handler), add ONE
entry to this table - do not invent a generic runtime heuristic** (there is none that can
distinguish "value that happens to start with on" from "handler" at the point the template
literal/spread key name is authored).

## §7. What the compiler now rejects at compile time, for free

Every one of these is now a hard `incompatible_with_custom_renderer` compile error
(`https://svelte.dev/e/incompatible_with_custom_renderer`), confirmed by direct compilation,
replacing the ENTIRE retired `preprocessor/forbid-web-only-constructs.ts` AST-walking guard:

| Construct | Old shim behavior | Now |
| --- | --- | --- |
| `bind:` on any element (§4) | silently no-op | **compile error** |
| `transition:`/`animate:`/`in:`/`out:` | silently no-op | **compile error** |
| `<svelte:head\|window\|body\|document>` | silently no-op | **compile error** |
| `{@html}` | compiled fine, painted nothing (the one construct that made a build-time gate mandatory, not just nice-to-have, in the old world) | **compile error** |
| `css: 'injected'` (combined with a string `customRenderer`) | N/A | **compile error** - `css: 'external'` is enforced, not just conventional |

`<svelte:element>` is **unaffected** and remains load-bearing (only its a11y `check_element` call
is skipped under `custom_renderer`) - still the only way to reach a CAPITALIZED, un-hyphenated
native tag (`RNSScreen`, `RNSScreenStack`) from a runtime string; see
`packages/navigation/src/svelte`.

`metro-svelte-transformer.cjs` no longer runs a separate guard pass before `compile()` - the
compile error IS the guard, and it fires from the SAME `compile()` call every consuming app's
bundle goes through, not just `svelte-check`/editor tooling.

## §8. Bootstrap / mount, current shape

`render.ts`'s `mount(rootTag, RootComponent, props)`:

```ts
const surface = createSurface(rootTag);
setActiveSurface(surface);                                    // §3
const target = createElementNode(ROOT_INTRINSIC);              // 'symbiote-view', flex:1 wrapper - unchanged rationale from the old shim's root-element.ts
routeProp(target, 'style', ROOT_WRAPPER_STYLE);
surface.appendChild(target);
surface.requestCommit();
svelteMount(RootComponent, { target, renderer: symbioteRenderer, props: props ?? {} });
```

`unmount(rootTag)` calls `svelteUnmount` then `setActiveSurface(undefined)`. Single root per
process is UNCHANGED as a design decision (still no micro-frontend-host scenario for this
project) - it is what makes the module-level `activeSurface` variable safe, exactly as it made
`patchGlobals()`'s module-level `previous` safe before.

## §9. Verification status - see the top-of-file Status section for the final numbers

`mount-pipeline.smoke.test.ts` (3/3) and `metro-svelte-transformer.test.ts` (12/12) were the
FIRST two files rewritten and proven, before the rest of the migration fanned out - both still
green. Every other file in `adapters/svelte/src/components/**`, `adapters/svelte/src/modules/
animated/**`, `packages/navigation/src/svelte/**`, and `packages/slider/src/svelte/**` has since
had the SAME mechanical transform applied (§4 `{@attach}` / §5 per-prop spread / §6 on-prefix
check / §11 style-key check). `tsc --build` is clean in all three packages. No real device/
simulator run has happened yet - `examples/svelte` is the eventual proof.

## §10. FIXED - `mountDescriptorChildren` never requested a commit, so `$effect`-mounted children never reached Fabric

**Found 2026-08-16 migrating `packages/slider/src/svelte/slider/index.svelte`; fixed the same day
in `descriptor-to-svelte.ts` and `renderer.ts`.** Recorded because the SAME shape of bug recurred
twice more the same day (§12's `hostProps`) - recognize the pattern, don't just patch the one
instance.

`descriptor-to-svelte.ts`'s `buildChild`/`mountDescriptorChildren` mutate the engine tree via the
raw engine `appendChild`/`removeChild` (imported straight from `@symbiote-native/engine`),
bypassing `renderer.ts`'s own `insertNode`/`removeNode`. That matters because `requestCommit()` is
NOT called by those raw engine functions - it is only called by the wrapper closures inside
`renderer.ts`'s `buildRenderer()` (`insert`, `remove`, `setAttribute`, `removeAttribute`,
`setText`), the ones Svelte's compiled template path calls through the `Renderer` interface. When
driven from `$effect` (or a `{@attach}` callback - both land in the same deferred effect-flush
pass, not synchronously with the host element's own insert), the append happens strictly AFTER
the wrapping element's own initial commit has already fired. No subsequent `requestCommit()` ever
ran, so the appended subtree was retained in the JS tree (`hostRef.children` DID contain it) but
never reached Fabric.

**Why this was never caught before Slider**: `Switch`'s `index.svelte` is the only other real
caller of `createDescriptorChildrenSync`, and its `descriptor.children` is always `[]` - the
append path this bug lived in was never actually exercised by a passing test.

**The fix**: `renderer.ts` exports `requestActiveCommit` (an alias for the same module-level
`requestCommit` the `Renderer` object's own wrapper closures already use - reads the `activeSurface`
singleton from §3). `mountDescriptorChildren` now calls it once after the initial build's
`appendChild` loop, and again at the end of every `update()`:

```ts
export function mountDescriptorChildren(parent, children): IDescriptorChildrenMount {
  const cached = children.map(child => { /* ...build + engineAppendChild... */ });
  requestActiveCommit();                      // <-- the fix
  return { update(next) { /* ...syncChild... */ requestActiveCommit(); } };
}
```

**Symptom to recognize this bug by, anywhere in this adapter**: a subtree built through
imperative/JS-only engine mutation (not through a compiled-template `{...spread}`/attribute) is
present in the retained tree (`parent.children` shows it) but `fabric.find(...)`/the real device
never shows it, and the fake-Fabric's `completeRoot`/`commit()` call count stays flat across the
mutation. If you add a NEW JS-only engine-mutation call site (anything calling `engineAppendChild`/
`engineRemoveChild`/`routeProp`/`setAttributeOp`/`setTextOp` directly, outside a `Renderer`
wrapper method), it needs its own `requestActiveCommit()` call at the end - this is not automatic.
**A second, independent instance of exactly this bug was found the same day** in
`packages/navigation/src/svelte/attachments.ts`'s `hostProps()` - every prop reaching a
react-native-screens leaf via `{@attach hostProps(...)}` (§7's `<svelte:element>` workaround)
went through raw `routeProp` too, with no commit request; fixed the same way (§13 notes it did
NOT fully explain that area's remaining test failures, so treat it as a necessary but not
sufficient fix if you're chasing something similar there).

## §11. The `style`-key template-attribute corruption - UNIVERSAL, affects almost every component

**Confirmed on the real compiled output, not guessed - the single highest-blast-radius bug found
during this migration**, because `style` appears on nearly every component. Svelte's compiler
recognizes the LITERAL KEY `style` specially - both as a direct `style={x}` attribute AND as a
`style` key inside a `{...spread}` object - and routes it through `$.set_style()` -> `to_style()`
(`svelte/internal/{client/dom/elements/style.js,shared/attributes.js}`), which does
`value = String(value)` UNCONDITIONALLY whenever there's no compiler-tracked `style:` directive
structure (our case, always - we author `style={value}` as a plain prop, never `style:color=`).
Our `IStyleProp` object/array becomes `"[object Object]"` (or worse for an array) BEFORE it ever
reaches `renderer.ts`'s `setAttribute`. This happens **regardless of custom-renderer mode**, and
a literal `style={x}` on a tag that ALSO carries a spread gets folded into the SAME merged call
as the spread - there is NO template-attribute form (literal or spread) that dodges it once any
spread is present on the tag, and literal-only tags aren't safe either (confirmed on
`touchable-opacity/index.svelte`, which had no spread at all and was still corrupted).

**The fix** (`renderer.ts`): rename the key before the object ever reaches the template, then
reverse the rename right before `routeProp`. Generalizes the exact mechanism §6 already
established for `onTintColor` - both are now one table:

```ts
export const TEMPLATE_KEY_UNMANGLE: Readonly<Record<string, string>> = {
  symbioteValueOnTintColor: 'onTintColor',
  symbioteStyle: 'style',
};
export function toTemplateSafeProps(props: Record<string, unknown>): Record<string, unknown> { /* rename real -> template-safe, forward direction */ }
// setAttributeOp's realPropName() reverses it - the same function §6 uses.
```

`remapOnPrefixedValueProps` is kept as an alias of `toTemplateSafeProps` - old call sites (Switch)
still work unchanged. **Calling `toTemplateSafeProps` is a safe no-op** if the object has neither
key, so the rule for every component is unconditional: wrap EVERY `symbiote-*` root prop spread
(and every literal `style={x}` attribute) in `toTemplateSafeProps(...)` - do not decide per-file
whether it's "needed", the check itself is what the helper already does internally.

**A WORSE workaround exists in a few places from before this was standardized - replace it if you
find it.** An imperative pattern of stripping `style` out, spreading the rest normally, then
calling `setAttributeOp(hostRef, 'style', value)` + `requestActiveCommit()` in a SEPARATE
`$effect` also "works", but `$effect` runs strictly after the initial synchronous mount - the node
commits once WITHOUT style, then a microtask later commits AGAIN with style, a real flash of
unstyled content on every single mount. `components/modal/index.svelte`, `components/image/
index.svelte`, and `components/image-background/index.svelte` briefly had this pattern (one
parallel migration agent invented it independently before `toTemplateSafeProps` existed) and were
reconciled back to the key-rename pattern the same day - if you see the imperative-`$effect`
shape anywhere else, replace it, don't leave it as "already handled some other way".

Confirmed this is NOT limited to spreads: `packages/slider/src/svelte/slider/index.svelte`'s
step-marker overlay had SEVERAL literal `style={CONSTANT}` attributes (no spread on those tags at
all) that were equally corrupted - `toTemplateSafeProps({ style: X })` around a single-key object
is the fix there too.

## §12. The `{@attach}` double-fire - `createAttachmentsSync` is now redundant almost everywhere

**Confirmed against the real Svelte source**
(`node_modules/svelte/src/internal/client/dom/elements/attributes.js`, the spread-handling
function): it walks `Object.getOwnPropertySymbols(next)` and auto-invokes `attach(element, () =>
n)` for any symbol whose `.description === ATTACHMENT_KEY` - generic, not DOM-specific, works
under a custom renderer exactly like on real DOM. This means as soon as a component spreads its
resolved props object directly onto a `symbiote-*` intrinsic (our post-shim per-prop design, §5),
Svelte's OWN compiled code ALREADY forwards any `{@attach}` riding in that object - no extra work
needed.

`runes/attachments.ts`'s `createAttachmentsSync()` existed to do exactly this UNDER THE OLD SHIM,
where props went through one object-bag prop (`p={bag}`), never a real template spread, so
Svelte's own spread-attachment machinery never saw the forwarded symbols. Now that it does, the
manual `$effect(() => syncAttachments(hostRef, rest))` call fires the SAME symbol-keyed entries a
SECOND time - confirmed empirically (`events[0].node === events[1].node`, both fired) - a real
double-invocation bug for any `{@attach}` an app author forwards through a wrapper component.

**Removed from 12 files** where the spread genuinely reaches the host tag with symbol keys
intact: `RefreshControl.svelte`, `SafeAreaView.svelte`, `View.svelte`, `Text.svelte`,
`scroll-view/index.svelte`, `activity-indicator/index.svelte`, `keyboard-avoiding-view/index.svelte`,
`image/index.svelte`, `pressable/index.svelte`, `components/switch/index.svelte`,
`input-accessory-view/index.svelte`, `components/modal/index.svelte`.

**Deliberately KEPT in 5 files - the manual sync is still load-bearing there**, because each one's
OWN internal prop-forwarding step drops symbol keys before the spread, or the forwarded object
never reaches the host tag's spread at all:
- `modules/animated/{AnimatedView,AnimatedImage,AnimatedText}.svelte` - `reduceProps` uses
  `Object.keys` internally (drops symbols).
- `components/text-input/index.svelte` - its own `forwardProps` helper uses `Object.entries`
  (drops symbols).
- `components/virtualized-list/index.svelte` - `outerBag` is built via explicit field assignment,
  never a spread of the raw incoming props at all.
- `components/image-background/index.svelte` - the wrapper node's own props never receive
  `passthrough`; `passthrough` only feeds the inner Image via `renderImageBackground`, so any
  `{@attach}` meant for the OUTER wrapper needs the manual re-sync.

**Before deleting a `createAttachmentsSync` call site in any OTHER file, trace where its
`props`/`rest`/`passthrough` argument actually ends up** - if it is spread verbatim (object
spread, which preserves symbol keys) onto the SAME host tag the attachment is meant to reach, the
manual sync is redundant and should go; if it passes through `Object.keys`/`Object.entries`/an
explicit field list first, or never reaches that tag's spread at all, the manual sync is still
required - removing it there is a silent regression (a forwarded `{@attach}` simply never fires
again), not a cleanup.

## §13. Known open issues (2026-08-16) - 4 of 177 tests, all narrow

**None of these are architectural gaps in the renderer** (§1-§12 cover the load-bearing design and
are all proven). Each is a specific, bounded, not-yet-root-caused behavior in one feature:

1. **`create-tunnel/create-tunnel.test.ts` - "paints the tunneled content once In mounts"** fails:
   `TunnelOut`'s `{#each tunnel.items as [id, snippet] (id)}` renders empty even after `TunnelIn`'s
   `$effect` should have populated the shared `SvelteMap` (`tunnel.ts`). Ruled out as a timing
   issue (tried up to 5 `await tick()` calls, no change - see the test's git history if you pick
   this up). `TunnelIn`/`TunnelOut` author no host tags of their own (pure `{#each}`/`{@render}`
   over a `SvelteMap` from `svelte/reactivity`), so this is NOT the same class of bug as §10/§12 -
   next step is instrumenting whether `TunnelIn`'s `$effect` actually runs and actually writes to
   `tunnel.items` under the custom renderer, before assuming the read side is at fault.

2. **`packages/navigation/src/svelte/stack/stack.smoke.test.ts`** - 3 of 10 tests fail, all
   involving `push()`/`pop()` actually changing the LIVE screen count (`registers every marker and
   can push/pop the second route through bind:this`, `replaces the top route without growing the
   stack`, `pops one route when the native screen reports a dismissal`). The initial mount (chrome,
   header config, `useIsFocused`, search bar wiring, nested stacks) all pass. `stack/index.svelte`'s
   own `push()`/`pop()`/`$derived(state)`/`{#each state.routes as route, index (route.key)}` reactive
   chain reads as architecturally correct on inspection - the `hostProps()` missing-commit fix
   (§10's second instance) measurably improved this area (2 of 5 originally-failing stack tests
   started passing) but did NOT fully resolve it. Next step: instrument whether `componentFor(route)`
   resolves for the SECOND route after `push()` (i.e. is `registry`/`screens` actually stable/correct
   post-push), before assuming it's another missing-commit case.

3. **`packages/navigation/src/svelte/tabs/tabs.smoke.test.ts`** - FIXED (was 1 failure from stray
   empty-`RCTRawText` bootstrap markers polluting `tabBarLabels()`'s raw walk - see the note below;
   the shared `outline()` helper in `fabric-tree.test-helper.ts` already filtered these, the local
   `tabBarLabels()` helper didn't). All 6 tabs tests are green now.

**A pervasive, cosmetic-but-architecturally-real finding, independent of the 4 failures above**:
Svelte's own mount bootstrap and block-boundary codegen (`{#if}`/`{#each}`/a component-root
dynamic block) create real, EMPTY `RCTRawText` nodes as positional markers, created once and
NEVER touched by `setText` again. The engine's `isAnchor()` check only recognizes
`createComment`/`createAnchor` nodes, not an empty-string raw text node, so these commit like any
other node and show up in `fabric.find`/a live tree walk. `fabric-tree.test-helper.ts`'s
`outline()` and `native-node-parity.test.ts`'s `isSvelteBootstrapAnchor()` both filter
`node.viewName === 'RCTRawText' && node.props.text === ''` - copy that predicate into any NEW
test helper that walks a live tree and asserts on shape/labels, or it will intermittently show
phantom entries exactly like §13.3 did.

**Investigated and deliberately NOT attempted**: making `renderer.ts`'s `createTextNodeOp` return
an anchor instead of a raw-text node when `data === ''`, to fix this at the SOURCE instead of in
every test helper. Rejected because `ISymbioteNode.component` is `readonly` (`core/engine/src/
node.ts`) - an engine node can never be "upgraded" from anchor to real text after creation, only
mutated via `setText`. If Svelte ever creates an EMPTY reactive text placeholder (`createTextNode('')`)
that is later given real content via `setText` - as opposed to the confirmed case here, a
genuinely permanent block-boundary marker - treating it as a permanent anchor at creation would
make that reactive text NEVER render, a strictly worse regression than the current cosmetic
noise. This was not empirically ruled out in the time available; before attempting the "fix at
the source" version, first prove (by compiling a probe with a BARE reactive `{expr}` text node,
no static prefix, and reading the compiled output) whether Svelte ever creates that placeholder
via a separate empty `createTextNode('')` call rather than baking the first real value directly
into the node at creation.
