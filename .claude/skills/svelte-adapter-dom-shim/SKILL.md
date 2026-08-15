---
name: svelte-adapter-dom-shim
description: "Symbiote Svelte adapter — the DOM-shim strategy and its exact hand-maintained surface. Read BEFORE writing any adapters/svelte/** code, before bumping the `svelte` dependency, and before debugging a Svelte-only render/event failure. Svelte's OFFICIAL custom-renderer API (sveltejs/svelte#18042, `createRenderer` from `svelte/renderer`) is still an UNMERGED PR, so the adapter instead patches globalThis DOM classes so stock compiled Svelte output runs unchanged — a deliberate, accepted coupling to Svelte PRIVATE internals, to be replaced by the official API once it ships. Holds: the measured mandatory DOM surface with file:line (init_operations' prototypes/descriptors/private fields; the 6 document factories; from_tree's build-once-then-clone; the universal `anchor.before()` mount path; createDocumentFragment in each/if/boundary); the CUSTOM-ELEMENT codegen path every hyphenated symbiote-* tag takes — importNode replaces cloneNode, and set_custom_element_data stringifies scalars and hard-excludes `style`, resolved by passing ONE object bag prop that lands as a property set and is unpacked into routeProp (which makes Svelte a flat-bag adapter, not a structural one, and collapses most of the event section); the dead-if-forbidden surface (svelte:head, element bind:, hydration, svelte:element, autofocus); why our camelCase onPress/onChangeText names DODGE Svelte's 23-name DELEGATED_EVENTS list and the lowercase-`onclick` trap that follows; the requirement that ISymbioteEvent be EXTENSIBLE and MUTABLE because handle_event_propagation writes a symbol and defines/deletes currentTarget on it; the measured React-Native 0.86 global collisions (installing `document` makes dev-menu React DevTools reconnects silently no-op via setUpReactDevTools' `!window.document` gate; navigator and requestAnimationFrame must NOT be patched; Node/Element/HTMLElement/Text collide with setUpDOM but with a narrow blast radius); and the lazy-engine-node design that avoids wolf-tui's third tree. NO web vocabulary belongs in the adapter — no div/span mapping, ever. Still OPEN: bootstrap/surface/multiple-roots, and how dev-warnings can detect a delegated event the shim never sees. Trigger on: 'svelte adapter', 'svelte support', DOM shim, patchGlobals, init_operations, from_tree, fragments:'tree', delegated events, bumping svelte, or issue #47."
---

# Symbiote Svelte adapter — the DOM-shim strategy

## §0. Status, provenance, and how to trust this file

**Status (2026-08-11): DECISION RECORDED, IMPLEMENTATION STARTING.** No
`adapters/svelte` exists yet, and `svelte` appears nowhere in `pnpm-workspace.yaml`.
This skill is the measured groundwork so implementation does not have to
rediscover any of it.

**PoC scope, DECIDED (2026-08-11):** the first target is the primitives only —
`View` / `Text` / `Image` through the shim (`patchGlobals` + `from_tree` + the
object-bag → `routeProp`). This proves the shim mechanism itself, the same order
Vue and Angular bootstrapped in. A `core/components` three-layer component
(Switch, TextInput, …) is a deliberate later step, once the bare mount/commit path
is green — mirroring Workstream B's own pilot order (ActivityIndicator → Switch).

**Superseded same day:** this PoC scope was the STARTING point, not where the
branch landed. By end of 2026-08-11 all 24 components (View/Text/Switch plus the
21 built across a 6-agent parallel dispatch) are implemented, wired into the
public `@symbiote-native/svelte` barrel, `tsc --build` clean, and smoke-tested
against the real compiler — see §15/§18 for what's verified and what's still open.

**Branch scope note:** this shim track is being implemented on
`feature/47-svelte-support`. A PoC against the still-unmerged official
`customRenderer` API (sveltejs/svelte#18042 — confirmed OPEN,
`reviewDecision: REVIEW_REQUIRED`, no release, as of 2026-08-11) is explicitly a
**separate, later branch**, not a blocker or prerequisite for this one.

**Measured against exact versions** — every `file:line` below was read from real
source, not from docs or memory:

- `svelte` **5.56.8** (`sveltejs/svelte` `main` @ `26786e9`, 2026-08-07)
- `react-native` **0.86.0** (tag `v0.86.0`; the pin in `pnpm-workspace.yaml:80`)
- `wolf-tui` (`OneEyed1366/wolf-tui`, `packages/svelte/src/renderer/`)

**Verification (2026-08-10).** This document was checked twice before being
committed: once by a zero-context comprehension pass (does a newcomer understand
it?) and once by an adversarial fact-check of every citation against the cloned
sources. Both found real defects, which are corrected here. Findings that
**reversed an earlier conclusion** are called out inline with a ⚠️ marker so a
future reader does not "re-fix" them back. §13 records what remains unverified.

If a version has moved, **re-measure before trusting a line number** — §11 has
the commands.

---

## §1. Background for a reader with zero context

### What problem this solves

SymbioteNative lets non-React UI frameworks drive React Native's native stack.
Each framework needs a **seam** — an official hook where the framework says "here
is how you create / insert / remove / update a node" — which we map onto
`@symbiote-native/engine`'s mutation API. The engine alone owns the translation into
Fabric's persistent clone-on-write child sets.

Every adapter so far was handed such a seam by its framework:

| Adapter | Official seam | Renderer size |
| --- | --- | --- |
| React | `react-reconciler` host config (mutation mode) | — |
| Vue | `@vue/runtime-core`'s `createRenderer` | 154 lines (`adapters/vue/src/renderer/index.ts`) |
| Angular | `Renderer2` / `RendererFactory2` | 347 lines (`adapters/angular/src/renderer/index.ts`) |

**Svelte, in its released versions, has no such seam.** It compiles a component
straight into direct `document.createElement()` / `.append()` calls. There is no
injection point.

### The two ways out

1. **The official custom-renderer API** — `createRenderer` from `svelte/renderer`,
   behind the `experimental.customRenderer` compiler option, in
   [sveltejs/svelte#18042](https://github.com/sveltejs/svelte/pull/18042). Its
   shape is close to Vue's `RendererOptions`. **As of 2026-08-10 the PR is still
   open**, opened March 2026, awaiting an approving review, with no release
   version and no announced date. (PR #18511 is a small follow-up in the same
   stack forcing the `custom-renderer` export condition for Node dual-modules —
   not the API itself.) Corroborated locally: the cloned 5.56.8 tree has **no**
   `customRenderer` compiler option and **no** `svelte/renderer` export.
2. **A DOM shim** — replace `globalThis.Node` / `Element` / `HTMLElement` /
   `SVGElement` / `Text` / `Comment` / `DocumentFragment` / `document` with our
   own classes, so Svelte's compiled output calls *us* while believing it calls
   the DOM. Needs no framework cooperation; works on released Svelte **today**.

### Why the shim was chosen

Option 1 would pin the adapter to an unmerged PR commit hash — an adapter nobody
can install. Option 2 ships against released Svelte.

**The accepted trade, stated explicitly by the project owner (2026-08-10):** the
shim couples us to Svelte's *private* internals, which carry no compatibility
guarantee. We accept that, maintain it by hand, and fix breakage honestly and
promptly when a Svelte release breaks a user. **When #18042 merges and ships, we
move to the official API.** This skill exists so that maintenance is a checklist
rather than an archaeology expedition.

### Prior art: wolf-tui

`wolf-tui` (same author; the architectural ancestor of SymbioteNative) already ships a
Svelte package built exactly this way — `packages/svelte/src/renderer/`:
`wolfie-element.ts` (860), `wolfie-document.ts` (300), `wolfie-action.ts` (73),
`init-layout-tree.ts` (38) = **1271 lines**. Its README states the reason plainly:
*"Svelte 5 has no custom renderer API — this is the only way to intercept its DOM
calls"* (`packages/svelte/README.md:16`).

**Read it for the shape; do not port it verbatim.** §9 and §12 record what must
change and why.

### An alternative that was raised and NOT decided

**Solid** has a stable, released, documented universal-renderer seam
(`createRenderer` from `solid-js/universal`), and `wolf-tui/packages/solid/src/renderer`
is a ready twin. It would need no shim and no dev pin. It was raised as a way to
ship a non-React adapter with zero compromise while Svelte's API matures. **No
decision was made on Solid** — recorded here only so the option is not lost.
Choosing the Svelte shim did not reject it.

---

## §2. How the shim works, mechanically

Svelte's client runtime calls `init_operations()` once, before any rendering. It
**reads two property descriptors off `Node.prototype`** (`firstChild`,
`nextSibling`) to cache fast paths, and **writes cache fields onto
`Element.prototype` and `Text.prototype`**. That is the hook: if our classes are
the globals at that moment, Svelte's entire node vocabulary becomes ours.

Hence the shim must use **real classes with real prototype getters** — not
`Proxy` objects, not plain object literals. `wolfie-element.ts` is built that way
for exactly this reason.

Two compiler options make this far cheaper than it sounds:

- **`fragments: 'tree'`** — a plain (non-experimental) compiler option, `@since 5.33`
  (`compiler/types/index.d.ts:130-138`), added for CSP
  `require-trusted-types-for 'script'`. It makes the compiler emit `from_tree()`,
  which builds templates element-by-element via `document.createElement()`,
  instead of `from_html()`, which assigns `innerHTML` on a `<template>`. **With
  this option we never need an HTML parser.** wolf-tui had to write one
  (`parseHTMLIntoFragment`, `wolfie-document.ts:81-128`); we do not. This option
  is **mandatory for us**, not a preference.
- **`css: 'external'`** (`compiler/types/index.d.ts:109`) — keeps Svelte from
  injecting `<style>` into a `document.head` that does not meaningfully exist.
  Styling goes through `@symbiote-native/css-parser` + the class registry, the same path
  Vue SFC `<style>` blocks already use.

`patchGlobals()` must be reversible (`restoreGlobals()` on unmount), mirroring
`wolfie-document.ts`.

---

## §3. The MANDATORY DOM surface

Everything here is on the hot render path and **must** be implemented. Paths are
relative to `packages/svelte/src/internal/client/` in the Svelte repo unless
stated otherwise.

### 3a. `init_operations()` — `dom/operations.js:38-75`

The single most private thing we depend on.

| What it does | Our obligation |
| --- | --- |
| `$window = window` | RN already sets `global.window = global` (`Libraries/Core/setUpGlobals.js:18-20`). **Nothing to do.** |
| `$document = document` | We must provide `document`. See §6a for the one real cost of doing so. |
| `is_firefox = /Firefox/.test(navigator.userAgent)` | **Do NOT patch `navigator`** — §6b. |
| reads `Node.prototype` descriptors for `firstChild` and `nextSibling` | **These getters must live on `Node.prototype` itself**, not as instance own-properties and not per-subclass. Svelte extracts them ONCE and then calls `getter.call(node)` for nodes of *every* type (`operations.js:88,97` — applied to fragments, elements and text alike). |
| writes `CLASS_CACHE`, `ATTRIBUTES_CACHE`, `STYLE_CACHE`, `__e` onto `Element.prototype`; `TEXT_CACHE` onto `Text.prototype` | Guarded by `is_extensible(...)`. Our prototypes must not be frozen or sealed. |
| **DEV only:** writes `__svelte_meta = null` onto `Element.prototype` (`operations.js:69-73`) | ⚠️ This is a **sixth** field, and it sits **outside** the `is_extensible` guard (which closes at line 63). Dev builds — i.e. the canary — write it unconditionally. An earlier draft said "5 private fields"; it is 5 in prod, 6 in DEV. |

`CLASS_CACHE` / `ATTRIBUTES_CACHE` / `STYLE_CACHE` / `TEXT_CACHE` are `Symbol()`s
(`internal/client/constants.js:66-69`); `__e` and `__svelte_meta` are plain string
fields.

### 3b. The six document factories

| Call | Source |
| --- | --- |
| `document.createTextNode(value)` | `dom/operations.js:82` |
| `document.createElement(tag)` / `createElement(tag, { is })` | `dom/operations.js:251` |
| `document.createElementNS(ns, tag)` / with `{ is }` | `dom/operations.js:255` |
| `document.createDocumentFragment()` | `dom/operations.js:260` |
| `document.createComment(data)` | `dom/operations.js:268` |
| `document.importNode(node, true)` | `dom/template.js:78,245` — ⚠️ **this is our PRIMARY clone path, not a fallback.** Every Symbiote primitive is hyphenated, hence a custom element, hence sets `TEMPLATE_USE_IMPORT_NODE` — see §3g. Functionally it is still a deep clone (we have one document), so delegating to `cloneNode` is correct; but it is `importNode` that must be tested and watched, not `cloneNode`. |

### 3c. Required node members

Collected from every mandatory path. A shim missing any of these fails.

| Member | Where it is required | Note |
| --- | --- | --- |
| `firstChild`, `nextSibling` | `operations.js:52-54,88,97` | **must be `Node.prototype` getters** (§3a) |
| `lastChild` | `template.js:250` | read as an **ordinary property**, not via the cached descriptor |
| `append(...nodes)` | `template.js:176,182,202,207,345` | **variadic** — `template.js:345` is `frag.append(start, anchor)`, a 2-arg call. Not the same method as `appendChild`. |
| **`before(node)`** | `template.js:378`, `blocks/snippet.js:93`, `blocks/boundary.js:282` | ⚠️ **The universal mount path.** `export function append(anchor, dom) { … anchor.before(dom) }` (`template.js:358-379`) is how every block and component gets mounted. An earlier draft omitted this entirely — a shim built to that draft fails at the *first* mount. |
| `nodeName` | `template.js:198,203` | compared against `TEMPLATE_TAG` and `'foreignObject'` |
| `content` | `template.js:199` | only when `nodeName` is `TEMPLATE`; we never emit `<template>`, so leaving it undefined is fine |
| `cloneNode(deep)` | `template.js:245` | deep clone, **per instantiation** — see below |
| `ownerDocument` | `dom/elements/events.js:175` | read on **every handled event**; must return our document |
| `textContent = ''` | `operations.js:217-218` (`clear_text_content`), used by the `{#each}` fast path at `blocks/each.js:117` | setter must clear children |
| `appendChild`, `insertBefore`, `removeChild` | general mutation | DOM move semantics — already free from the engine, §12 |
| `addEventListener` / `removeEventListener` | `dom/elements/events.js` | §5 |
| `setAttribute` / `getAttribute` / `removeAttribute` | `template.js:193` and the attribute layer | |

### 3d. `from_tree` — `dom/template.js:171-259`

The template path under `fragments: 'tree'`. Reproduced with elisions marked; the
real function is worth reading in full.

```js
function fragment_from_tree(structure, ns) {
  var fragment = create_fragment();
  for (var item of structure) {
    if (typeof item === 'string') { fragment.append(create_text(item)); continue; }
    if (item === undefined || item[0][0] === '/') {
      fragment.append(create_comment(item ? item[0].slice(3) : '')); continue;
    }
    const [name, attributes, ...children] = item;
    /* … namespace selection elided … */
    var element = create_element(name, namespace, attributes?.is);
    for (var key in attributes) set_attribute(element, key, attributes[key]);
    if (children.length > 0) {
      var target = element.nodeName === TEMPLATE_TAG ? element.content : element;
      target.append(fragment_from_tree(children,
        element.nodeName === 'foreignObject' ? undefined : namespace));
    }
    fragment.append(element);
  }
  return fragment;
}
```

**The `structure` encoding** (needed to read the above): a nested tuple array
emitted by the compiler. A `string` item is a text node. An item whose
`item[0]` begins with `'/'` is a **comment** — `['// text']`, with the data at
`item[0].slice(3)`. Anything else destructures as
`[tagName, attributesObject, ...childItems]`. `undefined` also means a comment
(an empty one).

**The structural fact that drives everything else** (`from_tree`, lines 219-259):

```js
if (node === undefined) {            // :232 — the template graph is built ONCE
  node = fragment_from_tree(structure, ns);
  if (!is_fragment) node = get_first_child(node);
}
var clone = use_import_node || is_firefox
  ? document.importNode(node, true)
  : node.cloneNode(true);            // :245 — and DEEP-CLONED per instance
```

`get_first_child(clone)` (`:249`) goes through the cached descriptor;
`clone.lastChild` (`:250`) is a plain property read. Corroborated by the compiler's
own docs: *"`tree` creates the fragment one element at a time and then clones it"*.

**This once-build-then-clone shape is why the engine node must be lazy — §9.**

### 3e. `createDocumentFragment` on the hot block paths

Not only templates; the core control-flow blocks allocate fragments per update:

| Source | Feature |
| --- | --- |
| `dom/blocks/each.js:160` | `{#each}` |
| `dom/blocks/branches.js:142,192` | `{#if}` / `{:else}` |
| `dom/blocks/boundary.js:272,305` | `<svelte:boundary>` |

A fragment must be **cheap**, and must implement the DOM rule that inserting a
fragment inserts its *children* and leaves the fragment empty.

### 3f. Ordering: when must `patchGlobals()` run?

⚠️ **Corrected.** An earlier draft derived a hard rule from `constants.js:80-83`:

```js
export const IS_XHTML =
  !!globalThis.document?.contentType &&
  /* @__PURE__ */ globalThis.document.contentType.includes('xml');
```

That derivation was **wrong**. The optional chaining means this cannot throw and
`IS_XHTML` resolves to `false` whether or not the shim is installed — so this code
imposes **no** ordering constraint at all.

**The real constraint is weaker and different:** `init_operations()` reads the
globals *at call time*, and it is called before the first render, not at module
load. So the actual rule is:

> **`patchGlobals()` must run before `mount()` — not necessarily before the
> Svelte module is imported.**

That is much easier to satisfy. Keep a `dlog` at `patchGlobals()` anyway so the
ordering is observable, and re-check this if Svelte ever adds a module-level DOM
access that is *not* optional-chained.

### 3g. ⚠️ Our primitives are CUSTOM ELEMENTS to Svelte — a different codegen path

**No web primitives ever appear in this adapter.** `<div>`, `<span>`, `<p>` are
not mapped, not aliased, and not special-cased: the adapter must carry no web
vocabulary at all. `createElement(tag)` asks `descriptorFor(tag)`
(`core/components/src/component-names/index.ios.ts` — `symbiote-view → RCTView`,
`symbiote-text → RCTText`, …, with an Android twin), and a tag with no entry is
simply an unknown element. The error must come from the **absence** of a match,
never from a table of HTML tags we'd otherwise have to maintain.

That constraint has a consequence that is easy to miss and expensive to discover
late. Every Symbiote intrinsic is **hyphenated**, and
`is_custom_element_node` (`compiler/phases/nodes.js:40-46`) is:

```js
node.type === 'RegularElement' &&
  (node.name.includes('-') ||
   node.attributes.some((attr) => attr.type === 'Attribute' && attr.name === 'is'))
```

So **every one of our host tags compiles down the custom-element path**, which
differs from the ordinary element path in two ways.

#### (a) `importNode` replaces `cloneNode`

```js
// compiler/phases/3-transform/client/visitors/RegularElement.js:58
context.state.template.needs_import_node ||= name === 'video' || is_custom_element;
```

→ `visitors/Fragment.js:96,140-141` ORs in `TEMPLATE_USE_IMPORT_NODE` →
`dom/template.js:245` picks `document.importNode(node, true)`.

Harmless in effect (same deep clone, one document) but it moves the thing to
test and to watch. §8's checklist reflects this.

#### (b) Attributes go through `set_custom_element_data`, which STRINGIFIES

`RegularElement.js:670` emits `$.set_custom_element_data(node, name, value)`
instead of `set_attribute`. The implementation (`dom/elements/attributes.js:226-273`):

```js
if (
  prop !== 'style' &&
  (setters_cache.has(node.getAttribute('is') || node.nodeName) ||
   !customElements ||
   customElements.get(node.getAttribute('is') || node.nodeName.toLowerCase())
     ? get_setters(node).includes(prop)
     : value && typeof value === 'object')
) {
  node[prop] = value;                                    // property set, type preserved
} else {
  set_attribute(node, prop, value == null ? value : String(value));   // ← String()
}
```

Three hazards:

1. **`style` is explicitly excluded** and therefore always stringified. A style
   *object* becomes `"[object Object]"`. Correct for the web (where `style` is a
   CSS string); fatal for us. **Never use the literal attribute name `style` on a
   host tag.**
2. **Scalars are stringified.** `numberOfLines={3}` arrives as `"3"`; booleans as
   `"true"`.
3. **Which branch runs depends on `customElements`.** wolf-tui stubs it
   (`{ define: noop, get: () => undefined }`, `wolfie-document.ts:259`), which
   makes the ternary condition falsy and selects the
   `value && typeof value === 'object'` heuristic. Leaving `customElements`
   undefined instead selects `get_setters(node)` — and `get_setters`
   (`attributes.js:588-606`) walks the prototype chain **stopping at
   `Element.prototype`**, which for us *is* our own element class, so the loop can
   run zero times and return `[]`.

#### (c) The resolution: one object prop, not many attributes

Host tags take a **single object-valued prop** rather than a spread of
attributes. An object always satisfies `value && typeof value === 'object'`, so it
lands as `node[prop] = value` — a **property assignment**, untouched, with no
stringification and no dependence on the `customElements` stub. Because we choose
the property name, the shim element class can define a **real setter** for it on
the prototype, which is where the bag is unpacked and handed to `routeProp`
(`core/engine/src/node.ts:231-263`) — the same entry point React's flat bag and
Vue's `patchProp` already use, so class/style merging and prop-vs-event routing
stay identical across adapters.

Consequences to keep in mind:

- **This makes Svelte a FLAT-BAG adapter, not a structural one.** ⚠️ The engine's
  own comment at `node.ts:140-142` currently predicts the opposite — it names
  "Svelte `addEventListener`" as a *structural* adapter that calls
  `setEventListener` directly. Under the bag design, host props (including
  handlers) reach the engine through `routeProp` instead. Keep the
  `addEventListener` path implemented as well (raw host-tag authoring, and
  anything Svelte routes as a real event), but the bag is primary. **Update that
  engine comment when this lands.**
- **Most of §5 collapses.** Handlers passed as component props (`<View onPress={fn}>`
  — idiomatic Svelte 5 callback props) ride inside the bag and never touch
  Svelte's event system at all: no `addEventListener`, no
  `handle_event_propagation`, no extensible/mutable `ISymbioteEvent` requirement,
  no delegation trap. §5 still applies to any real event Svelte does attach, so it
  stays — but it is no longer the main path.
- **⚠️ A per-key diff in the setter is MANDATORY, not an optimization.** An
  earlier draft warned about "referential stability" and suggested a fresh bag
  might be "skipped as unchanged". That was wrong in both directions: **Svelte
  performs no value comparison on this path at all.**
  - `template_effect` (`reactivity/effects.js:388-394`) is a bare `RENDER_EFFECT`
    that just calls the thunk — no `Object.is`, no memo.
  - `set_custom_element_data` has **no early-out guard**, unlike `set_attribute`
    (which caches via `ATTRIBUTES_CACHE`). Hence the compiler's note that it
    "may not be idempotent" and is deliberately **not grouped** with other
    attribute updates (`RegularElement.js:669-673`).

  What survives: effects are **dependency-tracked, not tick-based**, so unrelated
  state never reaches us; and when an attribute value contains no reactive state,
  `has_state` (`RegularElement.js:668`) emits the call **once at init** with no
  effect at all, so static props are free.

  What we lose: **per-attribute granularity.** Normally each attribute gets its
  own effect and re-runs only for its own dependency. With one bag, the single
  effect re-runs when *any* prop changes, rebuilds the whole object, and hands
  the shim everything.

  So the setter must keep the previous bag, compare per key, and call `routeProp`
  only for keys that actually changed — exactly what Vue's `patchProp` receives
  for free (`prev`/`next` per key). Without the diff, changing one prop rewrites
  all of them: the engine's `setProp` (`node.ts:123-129`) neither compares nor
  dirty-tracks, so the node is marked changed and the commit clones a subtree
  whose props are identical. With the diff, rebuilding an object and comparing
  5-15 keys is negligible against the Fabric commit it prevents.

  A hybrid (static props as individual attributes to keep `has_state`, reactive
  ones in the bag) is **not** worth it — it complicates component authoring and
  reintroduces scalar stringification for the static ones.
- **This facade is INTERNAL.** App code writes `<View style={s} onPress={fn}>`
  exactly as it would in any Svelte app; only the adapter's own `View.svelte` and
  friends emit `<symbiote-view p={bag}>`. User-facing DX is unaffected.

---

## §4. The surface that is DEAD if we forbid the feature

None of this needs implementing **provided** the corresponding Svelte feature is
forbidden and the prohibition is made loud (§7).

| Source | Feature |
| --- | --- |
| `dom/blocks/svelte-head.js:24,48` (`document.head`) | `<svelte:head>` |
| `dom/elements/bindings/document.js` (`document.activeElement`) | `bind:activeElement` |
| `dom/elements/bindings/navigator.js` (`navigator.onLine`) | `bind:online` |
| `dom/elements/bindings/input.js:89`, `select.js:123`, `universal.js:59,73` | `bind:` on **elements** |
| `dom/elements/misc.js:13,17,41` | `autofocus`, `document.addEventListener` |
| `dom/elements/attributes.js:645` (`document.baseURI`) | `src`/`srcset` URL comparison |
| all of `dom/hydration.js` | hydration (never applicable) |

⚠️ **`dom/blocks/svelte-element.js:95` (`<svelte:element>`) was previously listed here
and does NOT belong — it is load-bearing, not dead.** It is the only way to reach a
CAPITALIZED, un-hyphenated native tag (`RNSScreen`, `RNSScreenStack`, `RNSSearchBar`):
a literal `<RNSScreen>` in a template parses as a *component reference*, not an element,
and Slider's Descriptor-bridge workaround does not generalize to a tag with live
framework children. `<svelte:element this={'RNSScreen'}>` builds it from a runtime string
the compiler never inspects. Established by `packages/navigation/src/svelte` (2026-08-14);
do not "re-fix" this row back.

The §15 warning about `<svelte:element>` still stands and is NOT in conflict: a dynamic
tag compiles through the generic `setAttribute` path, so `p={bag}` silently fails to land
on it. That is why the navigation screens carry their props through an `{@attach}` instead
(`node.p = props` from plain JS). **Dynamic tag: yes. `p={bag}` on a dynamic tag: no.**

⚠️ **`dom/elements/events.js:122` (`document.body`) was previously listed here and
does not belong either.** It is the delegation root, and delegation is **not** a feature
we forbid — §7 describes an app author writing lowercase `onclick`, which reaches
exactly this path. Either provide a minimal `document.body` node, or forbid
delegated names outright. Do not leave it undefined and unwarned.

**Asymmetry against the official API.** With `experimental.customRenderer` the
Svelte **compiler itself** rejects `bind:` on elements,
`transition:`/`animate:`/`in:`/`out:`, `svelte:window|body|document|head`,
`css: injected`, `createRawSnippet` and hydration — at compile time. Under the
shim all of those **compile successfully and then silently do nothing**. Silent
failure is the shim's single worst property; §7 is the mitigation and is not
optional.

### Sanctioned workarounds

- **`bind:` on elements** → bindable primitives as **components** with
  `$bindable()` props. (The official API forces the same shape, so this is not
  throwaway work.)
- **`transition:` / `animate:`** → document `@attach` instead — the Svelte
  maintainer's own recommendation in issue #47. Our `Animated` lives in
  `core/engine` and does not depend on Svelte.
- **`<svelte:window|body|document|head>`** → no meaning in RN; use the
  corresponding runtime module (`Dimensions`, `AppState`, `StatusBar`, …), all
  already in `core/engine` and re-exported per adapter.

### `getComputedStyle`

Not read by any mandatory path measured here. wolf-tui stubs it
(`wolfie-document.ts:242`) because Svelte's `style.js` can reach it via
transitions — which we forbid. **Provide a `() => ({})` stub anyway**: it is one
line, and it converts a potential hard crash in a forbidden path into a no-op.

---

## §5. Events

> ⚠️ **Read §3g(c) first.** Under the object-bag design, host props — handlers
> included — reach the engine through `routeProp` and never touch Svelte's event
> system. Everything below therefore applies to the *secondary* path: real events
> Svelte does attach (raw host-tag authoring, and anything outside the bag). It
> stays mandatory, but it is no longer where most interactions flow.

### 5a. The listener path

Svelte attaches through `element.addEventListener(name, wrapped, options)` and
detaches through `removeEventListener`. `create_event` (`events.js:56+`) wraps the
user handler and calls `handle_event_propagation.call(dom, event)` — **in the
bubble phase only** (`events.js:60-64`: `if (!options.capture) { … }`).

`events.js:76-79` defers attachment for `pointer*` / `touch*` / `wheel` (a Chrome
`cloneNode` bug). Our names never match those prefixes, so the branch is inert.

### 5b. ⚠️ The event object must be EXTENSIBLE and MUTABLE

An earlier draft claimed `handle_event_propagation` touches "exactly two
properties". **That was wrong.** `dom/elements/events.js:173-305` does all of:

| Line | Operation |
| --- | --- |
| `:175` | reads `handler_element.ownerDocument` — a **node** member (see §3c) |
| `:176` | reads `event.type` |
| `:177` | calls `event.composedPath?.()` (optional — may be absent) |
| `:178` | reads `event.target` |
| `:192` | **reads** an expando `event[event_symbol]` |
| `:232` | `define_property(event, 'currentTarget', { configurable: true, get() {…} })` |
| `:282` | reads `event.cancelBubble` |
| `:299` | **writes** `event[event_symbol] = handler_element` |
| `:301` | `delete event.currentTarget` |

**Consequences for `ISymbioteEvent`:**

- it must be **extensible** (a symbol is written onto it) and **configurable**
  (`currentTarget` is defined and later deleted). A frozen or sealed event throws
  in strict mode.
- `type` must be populated, or delegated lookups key off `undefined`.
- `target` must be populated.
- `cancelBubble` must at minimum be readable.
- `composedPath` may be omitted (optional call).

### 5c. Event names — the lucky break

Two measured facts combine in our favour:

1. **Svelte does not lowercase event names.**
   `compiler/phases/3-transform/client/visitors/shared/events.js:16` is literally
   `let event_name = node.name.slice(2);`, with no `toLowerCase()` in the file.
   Delegation is decided from the same raw slice
   (`phases/2-analyze/visitors/Attribute.js:63`). And `is_event_attribute` is just
   `name.startsWith('on')` (`compiler/utils/ast.js:79-81`), so `onPress` **is**
   recognised as an event attribute. Result: `onPress` → `'Press'`.
2. **The delegated-event list is 23 all-lowercase DOM names** (`src/utils.js:110-134`,
   verified name-by-name, in order):

   ```
   beforeinput, click, change, dblclick, contextmenu, focusin, focusout,
   input, keydown, keyup, mousedown, mousemove, mouseout, mouseover, mouseup,
   pointerdown, pointermove, pointerout, pointerover, pointerup,
   touchend, touchmove, touchstart
   ```

**No camelCase SymbioteNative name can ever match.** Every one of our events takes the
ordinary `addEventListener` path. **Delegation never enters our own picture** — a
large category of expected pain that simply does not apply.

### 5d. The name mapping the shim owns

⚠️ **Corrected citation and entry point.** The engine's own comment
(`core/engine/src/node.ts:140-142`) already anticipates us:

> *"Structural adapters (Svelte `addEventListener`, Angular `Renderer2.listen`)
> call this directly with an already-known event name; flat-bag adapters reach it
> through `routeProp`."*

So the shim's entry point is **`setEventListener` (`node.ts:143`), not `routeProp`
(`node.ts:231-263`)**. The `onX → x` conversion the engine uses lives in
`listenerName` (`node.ts:158-160`). Svelte hands us `'Press'`; the shim must
lowercase the first character to `'press'` before calling `setEventListener`.
Small, but it is ours to own and to test — including confirming that
`'ChangeText'` → `'changeText'` is what the engine actually expects for each
event we ship.

---

## §6. React Native 0.86 global collisions — measured

### 6a. ⚠️ `document` — RN does not define it, but installing it is NOT free

An earlier draft claimed the only `document` reference in RN's JS is behind
`Platform.OS === 'web'`, and concluded that installing `globalThis.document`
"collides with nothing". **That was wrong — it was measured in the wrong file.**

There are **two** references, and the second is not web-gated:

```js
// Libraries/Core/setUpReactDevTools.js:131-133
// not when debugging in chrome
// TODO(t12832058) This check is broken
if (!window.document) {
```

That `if` gates the whole body of `connectToWSBasedReactDevToolsFrontend()`, which
runs on load (`:234`) and on every dev-menu open. The module is required
unconditionally in dev (`setUpDefaultReactNativeEnvironment.js:27-28`, under
`if (__DEV__ && enableDeveloperTools)`), and RN sets `global.window = global`.

**Severity, refined by call timing.** There are exactly two triggers
(`setUpReactDevTools.js:230-234`):

```js
RCTNativeAppEventEmitter.addListener('RCTDevMenuShown', connectToWSBasedReactDevToolsFrontend);
connectToWSBasedReactDevToolsFrontend(); // Try connecting once on load
```

`patchGlobals()` runs when a Svelte surface mounts — app code, strictly after RN
bootstrap. So the **on-load** attempt happens while `document` is still undefined
and connects normally. Only a **dev-menu-triggered reconnect while a surface is
mounted** silently bails.

> **Net: React DevTools connects fine at startup; reconnecting from the dev menu
> silently no-ops while a Svelte surface is mounted.**

Dev-only, and mild — but real, silent, and the one place where the "libraries will
think they are on the web" worry did come true. **Document it in the adapter
README.** It cannot be avoided by unpatching after `init_operations()`: Svelte
reads bare `document.createElement` / `createDocumentFragment` on every template
build and block update (`operations.js:82,251,260`), so `document` must remain
installed for the surface's whole lifetime.

(`HoverState.js` remains correctly web-gated: `canUseDOM` at `:19-25` and
`document.addEventListener` at `:53-55` are all inside the `Platform.OS === 'web'`
block.)

### 6b. `navigator` — do NOT patch

`Libraries/Core/setUpNavigator.js:15-22` sets `global.navigator = {product: 'ReactNative'}`,
and force-polyfills `.product` if a navigator already exists.
**`navigator.product === 'ReactNative'` is the canonical way the ecosystem detects
React Native**; clobbering it breaks third-party detection silently.

wolf-tui sets `navigator = { userAgent: 'wolfie' }`
(`wolfie-document.ts:247`) because `init_operations()` reads `navigator.userAgent`.
**We do not need to.** RN's `navigator` exists but has no `userAgent`, so
`/Firefox/.test(undefined)` stringifies to `"undefined"`, does not match, and
yields `is_firefox === false` — exactly the value that keeps `document.importNode`
off the hot path. The property access is safe precisely *because* RN guarantees
`navigator` exists, and `setUpNavigator` runs at bootstrap
(`setUpDefaultReactNativeEnvironment.js:34`) long before any app import.

### 6c. `requestAnimationFrame` — do NOT patch

wolf-tui replaces it with `setTimeout(cb, 16)` (`wolfie-document.ts:256`). That
would silently degrade **our own** code: `core/engine/src/animated/animations/raf.ts`
reads the global **at call time** (`Reflect.get(globalThis, name)` inside
`readGlobal`, line 12; the rAF read at line 16), so every
`@symbiote-native/engine` Animated driver would drop to a 16 ms timer for as long as the
shim is installed.

⚠️ **Precision fix:** an earlier draft said RN "polyfills it lazily off
`JSTimers`" citing `setUpTimers.js:82-83`. Those lines are inside the **legacy-bridge
`else` branch** (`setUpTimers.js:22` is `if (global.RN$Bridgeless === true)`, whose
comment reads *"In bridgeless mode, timers are host functions installed from
cpp"*). SymbioteNative runs Fabric/bridgeless, so rAF comes from C++ and never touches
`JSTimers`. The conclusion is unchanged and if anything stronger: **leave
`requestAnimationFrame` and `cancelAnimationFrame` alone.**

### 6d. `window` — no conflict

`setUpGlobals.js:18-20` sets `global.window = global` only when undefined.
wolf-tui sets `g['window'] = globalThis` — identical. No action.

### 6e. `Node` / `Element` / `HTMLElement` / `Text` — a real, unavoidable collision

`src/private/setup/setUpDOM.js` polyfills exactly 14 classes — `DOMRect`,
`DOMRectReadOnly`, `DOMRectList`, `HTMLCollection`, `NodeList`, `Node`, `Document`,
`CharacterData`, `Text`, `Element`, `HTMLElement`, `Event`, `EventTarget`,
`CustomEvent` — called unconditionally from
`setUpDefaultReactNativeEnvironment.js:23`. RN defines **no** `Comment`,
`DocumentFragment` or `SVGElement`.

Our shim must own `Node`, `Element`, `HTMLElement`, `Text` (plus `SVGElement`,
`Comment`, `DocumentFragment`, which are free). **Four head-on collisions**, and
they are **unavoidable by construction**: `init_operations()` reads
`Node.prototype`, so the shim has to be the global.

`polyfillGlobal` → `polyfillObjectProperty` yields `writable: writable !== false`
= `true` for a fresh global (`Libraries/Utilities/PolyfillFunctions.js:39-49`), and
`defineLazyObjectProperty` installs a real setter — so **the overwrite succeeds
silently**, with no throw and no warning.

**Why the blast radius is nevertheless narrow:**

1. **RN's own internals do not break.** Every RN `instanceof` names the *imported*
   class, not the global — `instanceof ReactNativeElement` / `ReadOnlyElement`
   (`MutationObserver.js:75`, `IntersectionObserver.js:90,217,243`,
   `ReactNativeResponder.js:588`, `getScrollParent.js:30,40`,
   `VirtualRowGenerator.js:34`). Even the one global-looking case,
   `EventTarget.js:195` `instanceof Event`, resolves to `import Event from './Event'`
   at line 20.
2. **Our own code does not break.** A repo-wide grep for
   `instanceof (Node|Element|HTMLElement|Text|Comment|DocumentFragment)` returns
   **zero matches** (re-verified 2026-08-10).
3. **React-based RN component libraries are already out of scope** under
   `<third_party_rn_packages_are_react_only>` (CLAUDE.md).

**What does break:** the boundary. A real host instance from a ref is a
`ReactNativeElement`; after the patch `hostInstance instanceof Element` is `false`.
Third-party code doing `instanceof Node` / `instanceof Element` gets the wrong
answer in both directions.

**The exposure that actually matters is Svelte-side, not RN-side.** A Svelte
developer reaches for *Svelte/web ecosystem* packages, which are written for
browsers and do sniff the DOM. Under a shim those libraries **half-work** instead
of failing fast. Compare `symbiote-web-lib-portability-check`, which records the
project's independently-reached position on this exact class of problem (the
`react-router` rejection): prefer a dependency that fails honestly over one that
works by accident. **Document this in the adapter README** alongside §6a.

---

## §7. Dev warnings — DECIDED (2026-08-11), narrower than originally scoped

The shim's defining weakness is silent failure (§4). The original draft of this
section treated every §4 row as something an app author could write and silently
break on. That was wrong for three of the four rows, once one fact settled during
implementation planning: **app code never authors `symbiote-*` host tags.** Only
our own adapter source (`View.svelte`, `Text.svelte`, `Image.svelte`, …) emits
`<symbiote-view p={bag}>`; app code imports `View` / `Text` / `Image` from
`@symbiote-native/svelte`, exactly like every other adapter's public surface.

| Construct | Reachable from app code? | Why it needs no custom guard |
| --- | --- | --- |
| `bind:` / `transition:`/`animate:`/`in:`/`out:` on a raw `symbiote-*` tag | **No** | app code never writes a host tag; this is our own adapter source, written with discipline and covered by tests, not an app-facing dev-warning target |
| `bind:x` on one of OUR exported components (`<TextInput bind:value>`) | Yes, but already caught **for free** | Svelte's own compiler errors at compile time if `value` is not declared `$bindable()` inside the component — see the `$bindable()` decision below |
| lowercase delegated event name (`onclick`, …) passed as a prop to one of our components | Yes, but already caught **for free** | our exported prop types are explicit (`IViewProps` etc.) with no index-signature catch-all — an undeclared prop name is a plain TS error |
| a raw HTML tag (`<div>`, `<input>`) | Yes, but already caught **for free** | `descriptorFor` has no entry for it — "unknown element", same as any typo'd tag (§3g) |
| `<svelte:head\|window\|body\|document>` | **Yes — the one real gap** | these are compiler-level special elements, not typed symbols reachable through our exports; nothing above catches them, they compile cleanly, and they silently do nothing under RN |

**Net: the only construct that needs an actual dev-time guard is
`<svelte:head|window|body|document>`.** Everything else originally in §4's table
is already closed either by "app code cannot reach it" or by "the TS/Svelte
compiler already errors on it for free" — no bespoke detection code needed for
those.

### Two-way binding is supported, via `$bindable()` — not a gap

`bind:` is not a blanket-forbidden feature. Every prior adapter already has a
two-way-binding convention on its own controlled components — Vue's `v-model`
(`modelValue` prop + `update:modelValue` emit, `adapters/vue/src/utils/model-binding.ts`)
and Angular's banana-in-a-box `[(value)]` (`@Input() value` + `@Output() valueChange`,
`adapters/angular/src/components/text-input.ts:244`). Svelte's own native mechanism
for the same shape is `$bindable()`: `TextInput.svelte` declares
`let { value = $bindable() } = $props()` and `<TextInput bind:value={x}>` works with
no adapter-side plumbing at all — Svelte's compiler wires the two-way sync itself.
This is a normal, supported authoring path, not a workaround.

### Mechanism for the one real gap — DECIDED: build-time preprocessor

A Svelte preprocessor registered in `svelte.config.js` walks the template AST and
errors on any of the four `<svelte:*>` tags. This is not only a build-time gate —
`svelte-check` and the Svelte VS Code/language-server extension run the SAME
preprocessor pipeline, so the error surfaces live in the editor too, with no second
mechanism needed. (A pure TypeScript-level exclusion does not work here: these tags
are compiler-recognized syntax, not typed symbols our `.d.ts` controls.)

The runtime-trap alternative (hooking Svelte's delegation expando) is rejected — it
would couple us to yet another private field for a problem the preprocessor already
solves at zero extra runtime cost.

---

## §8. What to re-check on EVERY `svelte` version bump

Ordered by fragility. None of this is public API.

**0. The `browser` resolve condition must stay SCOPED to Svelte tests (`vitest.config.ts`).**
Svelte's `"."` export needs it or `mount()` throws `lifecycle_function_unavailable`, so the
temptation is to set it globally — do not. `less`, `sass` and `stylus` each declare a `browser`
key FIRST in their own `exports`, so a global condition resolves them to their BROWSER bundles,
which cannot load under Node; `core/css-parser`'s preprocessor tests then fail inside
`loadLess`'s catch with the misleading "less is required for .less files. Install it" even though
it is installed (diagnosed 2026-08-14). Ordering our conditions array cannot fix it — the first
matching key in the PACKAGE's declaration order wins, not ours. The config now splits into two
vitest projects, `svelte` (browser conditions) and `default` (none); the `svelte` project's
include list covers `adapters/svelte/**` AND `packages/**/src/svelte/**`, since each package
ships a per-framework entry whose smokes drive the same `mount()`. Find newly added ones with
`grep -rl --include='*.test.ts' svelte core packages adapters`.

1. **`init_operations()` (`dom/operations.js:38-75`)** — 2 descriptor extractions,
   5 private fields (+`__svelte_meta` in DEV). If Svelte changes how it caches node
   access, the shim stops working wholesale.
2. **`DELEGATED_EVENTS` (`src/utils.js:110-134`)** — a newly added name colliding
   with one of ours silently kills that event.
3. **`handle_event_propagation`'s event contract (`dom/elements/events.js:173-305`)** —
   currently reads `type`, `target`, `cancelBubble`, optional `composedPath()`,
   plus an expando read/write and `currentTarget` define/delete. If it starts
   requiring more, `ISymbioteEvent` must grow. (Note: it *already* calls
   `composedPath()` and *already* manipulates `currentTarget` — an earlier draft
   listed both as hypothetical futures.)
4. **`importNode(node, true)` semantics in `from_tree` (`template.js:244-246`)** —
   ⚠️ watch `importNode`, **not** `cloneNode`: every Symbiote tag is a custom
   element and therefore sets `TEMPLATE_USE_IMPORT_NODE` (§3g(a)). Clones must
   copy attributes and must **not** carry listeners, or instance state leaks
   between component instances.
4b. **The custom-element attribute path (`attributes.js:226-273`,
   `RegularElement.js:58,670`)** — if Svelte changes `set_custom_element_data`'s
   branch logic, the `customElements` interaction, or its `style` special-case,
   the object-bag design in §3g(c) must be re-validated.
5. **The mount path `anchor.before()` (`template.js:358-379`)** — if Svelte changes
   how blocks mount, this is where it shows.
6. **Module-level DOM access** — currently only the optional-chained `IS_XHTML`
   (`constants.js:80-83`), which imposes no ordering constraint (§3f). A new,
   non-optional one would.

**Suggested CI guard:** a test that imports Svelte's own `src/utils.js` and asserts
`DELEGATED_EVENTS` is byte-identical to a vendored copy, so a bump fails CI rather
than a user's screen.

---

## §9. Design decision: the engine node must be LAZY

`wolf-tui`'s `WolfieElement` creates its core node **eagerly in the constructor**
(`wolfie-element.ts:378-384`: `this.domElement = domEl ?? createNode(tagName, getLayoutTree())`),
then delegates through `_coreDom*` (`wolfie-element.ts:615-689`). For us that
would be wrong.

**Why:** §3d established that `from_tree` builds each template graph **once** and
`cloneNode(true)`s it per instance. Those template nodes are **prototypes** — never
inserted into a live tree. Creating an `ISymbioteNode` for each would (a) allocate
engine nodes that never render, and (b) force `cloneNode` to deep-clone engine
nodes too, with all the prop/listener-copying bugs that implies.

**Do instead:** the shim node creates its `ISymbioteNode` **lazily**, on first
insertion into a live tree. Then template prototypes never touch the engine,
`cloneNode(true)` copies only the shim structure, and only the live branch reaches
`@symbiote-native/engine`.

This collapses what would otherwise be **three trees** (shim tree → engine retained
tree → Fabric child sets) into a thin shim layer over the existing two.

Expect the **anchor/comment impedance** visible at `wolfie-element.ts:640-680`:
because a comment has no core node, wolf-tui hunts for the next non-comment sibling
to position against. We have the same shape — the engine's `createAnchor` /
`isAnchor` nodes are skipped by the commit walk (`node.ts:112-118`,
`commit.ts:175-179`) — so build and test that path deliberately.

---

## §10. Bootstrap — DECIDED (2026-08-11)

**Tag mapping is CLOSED (2026-08-10)** — see §3g. No web vocabulary in the
adapter; `descriptorFor` resolves `symbiote-*` intrinsics; an unknown tag errors
from the absence of a match. Do **not** adopt wolf-tui's blanket prefixing
(`wolfie-document.ts:161`: `tag.startsWith('wolfie-') ? tag : 'wolfie-' + tag`),
which would silently turn `div` into `symbiote-div`.

**Prop delivery is DECIDED (2026-08-10)** — the single object bag, §3g(c).

**Multi-root is explicitly OUT of scope, by design.** One Symbiote app = one
process = one Svelte root — matching how every other adapter is actually used;
this project has no micro-frontend-host scenario. `patchGlobals()` being
process-global is therefore not a limitation to design around, it is a non-issue
under the single-root assumption. **Do not build ref-counting for it.**

**Entry point is DECIDED** — mirror the Vue/React/Angular shape exactly
(`adapters/vue/src/render.ts` is the reference), not Svelte's own
`mount(Component, { target })` signature:

```ts
// adapters/svelte/src/render.ts
import { mount as svelteMount, unmount as svelteUnmount } from 'svelte';
import {
  createSurface,
  disposeRoot,
  type IRootTag,
  type SymbioteSurface,
} from '@symbiote-native/engine';

export function mount(rootTag: IRootTag, RootComponent: Component): SymbioteSurface {
  const surface = createSurface(rootTag);
  // Eager, NOT lazy — unlike §9's template prototypes, the root element IS the
  // live surface, so it must have an ISymbioteNode from the start.
  const rootElement = createRootShimElement(surface);
  const app = svelteMount(RootComponent, { target: rootElement });
  // track `app` by rootTag — same `Map<IRootTag, …>` + teardown-on-remount shape
  // as adapters/vue/src/render.ts's `apps` map.
  return surface;
}

export function unmount(rootTag: IRootTag): void {
  // single root ⇒ no ref-count: tear down the Svelte app, dispose the engine
  // root, then restoreGlobals() unconditionally.
}
```

Real Svelte's `mount`/`unmount` are imported under an alias inside this one file.
App code imports only OUR `mount`/`unmount` from `@symbiote-native/svelte` and
never sees Svelte's own — same as it never sees `@vue/runtime-core`'s
`createRenderer` from the Vue adapter. No public naming conflict.

**Unmount, beyond `restoreGlobals()`:** tear down the Svelte `app` (`svelteUnmount`),
`disposeRoot(rootTag)` (engine cleanup, same call every other adapter makes), then
`restoreGlobals()` — safe to call unconditionally, precisely because of the
single-root decision above.

**The dev-warning mechanism is DECIDED — see §7.**

Also still to design (covered by other skills, not here): the runes lifecycle layer.
No `descriptorToSvelte` bridge is needed — see §15's fixed-shape-render finding.

---

## §11. How to re-measure

The vendored reference paths in this repo (`.vendors/`, `wolf-tui/`) are
**symlinks to the author's local machine** (`.vendors -> /Users/andrprokopenko/projects/vendors`)
and are broken in any other checkout. Clone the real sources:

```bash
git clone --depth 1 https://github.com/sveltejs/svelte /workspace/sveltejs/svelte
git clone --depth 1 --branch v0.86.0 https://github.com/facebook/react-native /workspace/facebook/react-native
git clone --depth 1 https://github.com/OneEyed1366/wolf-tui /workspace/oneeyed1366/wolf-tui
```

```bash
# The DOM surface the client runtime touches
cd /workspace/sveltejs/svelte/packages/svelte/src/internal/client
grep -rnoE "\bdocument\.[a-zA-Z]+|\bnavigator\.[a-zA-Z]+" . | sed 's/.*://' | sort | uniq -c | sort -rn

# The delegated-event list
grep -n -A30 "const DELEGATED_EVENTS" /workspace/sveltejs/svelte/packages/svelte/src/utils.js

# RN's DOM-class polyfills, and every document reference in RN
cat /workspace/facebook/react-native/packages/react-native/src/private/setup/setUpDOM.js
grep -rnE "\bdocument\b" /workspace/facebook/react-native/packages/react-native/{Libraries,src} --include=*.js
```

Record the measured `svelte` version (`packages/svelte/package.json`) in §0.

---

## §11b. The shim's memory cost — MEASURED (2026-08-13): 548 B/node, i.e. ~1 MB, NOT the thing to blame

Do not reach for "the DOM shim eats memory" to explain a multi-megabyte gap against another
adapter. It was measured, and it is too small for that:

```
ShimElement (detached, n=100_000)            548.5 bytes/node
plain {parent, children, engineNode, tagName}  119.9 bytes/node
```

~430 B of the delta is structural, and most of it is the two `Map`s `ShimElement`'s constructor
allocates EAGERLY (`attributes`, `domListeners`) — almost always empty, because Symbiote
intrinsics take everything through the single `p` object bag (§3g(c)) and `on*` handlers ride
inside that bag, not through `addEventListener`. Making them lazy is the obvious win if node
counts ever get large; at a realistic screen's few thousand elements the whole shim layer is
about **1 MB**, so it cannot account for a 20 MB difference.

Two related claims that are WRONG and were corrected here:

- *"Vue keeps one object per element, Svelte keeps two."* No. `@vue/runtime-core` still builds
  and retains a **VNode tree** above the host nodes. Both adapters carry two retained layers;
  the shim is not a uniquely extra one, it just replaces VNodes with a DOM-shaped tree.
- *"A smaller bundle means less RAM."* Measured on the iOS dev bundles (2026-08-13):
  `vue-sfc 6.0M · svelte 5.9M · angular 8.4M` (879 / 967 / 1331 modules). Svelte's is the
  SMALLEST of the three while its device RSS is higher than Vue's — so bundle size does not
  order the RAM numbers and is not the explanation.

Method note for whoever picks this up next: RN **dev-build RSS is a weak instrument** for
adapter comparison (no bytecode precompilation, full source retained for stack traces, live
debugger connection, GC timing). Before attributing a delta, split JS heap from native memory
(Hermes heap snapshot via RN DevTools) and confirm the delta survives a release build — native
shadow nodes / views, not JS objects, dominate an RN process's footprint.

**That split was then actually measured (2026-08-14), and it settles the "is the shim leaking"
question — it is not.** Two Hermes heap snapshots of `examples/svelte`, same screen, minutes
apart, run through `scripts/analyze-heap-snapshot.mjs <early> <later>`:

```
JS heap total          55.86 MB  ->  55.90 MB      (+0.04, and see below)
engine nodes             1746   ->    1746
ShimComment              1216   ->    1216
ShimElement               463   ->     463
ShimDocumentFragment      273   ->     273
ShimText                  267   ->     267
```

Every adapter-owned class is IDENTICAL across the two. The whole shim layer is ~0.17 MB and the
engine's retained nodes ~0.13 MB. The +0.04 MB is not mystery growth either — the new strings in
the diff are literally the tester's own input (`"Hello, Andrew"`, `"volume · 100%"`), i.e. the
interaction performed between snapshots.

Two durable lessons from that session:

- **Growth that PLATEAUS is not a leak.** Device RSS climbed to ~200 MB and stopped while idle.
  A leak does not stop. The thing filling up is visible in the same dump: `CodeBlock` — Hermes'
  lazily-compiled bytecode — is 45.92 MB across 8263 objects, ~82% of the JS heap, because a DEV
  bundle compiles each function on first execution and keeps it. Touch more code paths, get more
  CodeBlocks, then it saturates.
- **JS flat + RSS moving means the movement is NATIVE.** RSS spiked to ~224 MB while tapping and
  came back down, with the JS heap unmoved — that is Fabric clone-on-write commit churn and
  UIKit views, not our objects. Do not go looking in JS for it.

Take snapshots with **Heap snapshot**, not Allocation sampling/timeline (a timeline cannot be
diffed for retention), and force GC (the trash icon) before each, or you are measuring garbage.

### The question this section opened with, ANSWERED (2026-08-14): in release the adapters are level

Measured with `scripts/measure-simulator-footprint.sh`, iPhone 17 Pro simulator, RELEASE builds
(`npm run ios:release`), each held until the number stopped moving — 16 consecutive identical
samples on both sides:

```
                        svelte    vue-sfc
footprint (plateau)      76 MB     74 MB
  untagged (VM_ALLOCATE) 26 MB     26 MB   <- Hermes GC heap: IDENTICAL
  MALLOC_SMALL           26 MB     23 MB
  CoreAnimation         8176 KB    11 MB   <- vue higher: it renders inside a navigator
  __DATA                5195 KB   5080 KB
```

**The gap is 2 MB, 2.7% — and it points the other way from the dev reading.** The dev-build
numbers that started this whole investigation (svelte 189 MB vs vue 167 MB, "Svelte should be
lighter, why is it heavier") were measuring the dev harness, not the adapters: a dev bundle's
lazily-compiled `CodeBlock` bytecode alone was 45.9 MB of a 55.9 MB JS heap. Release drops the
same app from ~200 MB to 76 MB.

What is left cannot be attributed to the adapter either: `examples/vue-sfc` runs its screen
inside a `Stack` navigator (react-native-screens' native RNSScreen layers) while
`examples/svelte` is a bare ScrollView, which is exactly where vue's extra 3 MB of
`CoreAnimation` comes from. The Hermes heaps are the same size to the megabyte.

So: the DOM shim does not cost what the web intuition predicts here, and **no adapter-level
memory work is warranted on this evidence**. If someone reopens this, re-measure in release
first — a dev-build comparison is not evidence.

## §11c. An EMPTY text node is an ANCHOR, not text — FIXED 2026-08-14, found by cross-adapter diffing

`dom-shim/text.ts`'s `createEngineNode()` used to call `createRawText(this.value)`
unconditionally. Svelte builds every block/component boundary anchor with `create_text()`, i.e.
`document.createTextNode('')` — so **every `{#if}`, `{#each}`, `{@render}` and component
instance in the app was committing a real `RCTRawText ""` Fabric node** where Vue and Angular
commit nothing at all.

Three costs, ascending: a real extra shadow node per block/instance (it scales with list items,
since each item instance carries its own anchor); an empty `RCTRawText` actually **paints** in
Fabric (precisely why the Vue renderer's `createText` has always read
`text === '' ? createAnchor() : createRawText(text)` — `renderer/index.ts`); and a raw-text child
of a non-Text parent is the invalid "text outside `<Text>`" shape §16 also warns about. The shim
was simply missing the mapping Vue had from the start.

**Why "empty means anchor" is sound and not a heuristic:** template text always carries at least
one character. A dynamic interpolation compiles to a literal `' '` placeholder inside the
`from_tree` template and is overwritten by `set_text` afterwards — verified by reading the
compiled output of `{#each rows as row}…{row}…{/each}`:

```js
var root = $.from_tree([['symbiote-view', null, ['symbiote-text', null, ' ']]], 2);
//                                                                        ^^^ not ''
$.template_effect(() => $.set_text(text, `row ${$.get(row) ?? ''}`));
```

So `''` at creation time only ever means anchor.

**The one wrinkle, handled:** a node that mounts empty becomes an anchor, and the engine has no
anchor→text conversion (an anchor is a distinct component). If such a node is later given real
content, `set data` PROMOTES it — removes the anchor from the parent engine node and inserts a
fresh raw text at the same position, anchoring before the first *live* following sibling exactly
as `ShimNode.insertOne` does. The reverse is deliberately NOT done: a node that once had content
and is set back to `''` stays a raw text, because that is genuine empty text content and is what
React commits there too, and demoting would churn the tree on every binding that empties.

**How it was found, and the method worth reusing:** `adapters/svelte/src/native-node-parity.test.ts`
mounts the same intended UI through the Svelte and Vue adapters into one fake Fabric and diffs
the committed native tree STRING. The extra nodes showed up immediately as trailing
`RCTRawText ""` entries Vue's tree simply did not have. A count alone would not have located
them; the serialized shape did. That test now also locks in the remaining, legitimate difference
— Svelte commits exactly ONE extra node in total, the constant `root-element.ts` wrapper.

## §12. Size estimate, and what NOT to port from wolf-tui

⚠️ **Corrected.** An earlier draft claimed "roughly two-thirds does not apply" and
estimated 350-450 lines. The arithmetic did not support that. Honest accounting
against wolf-tui's 1271:

| Chunk | Lines | Verdict |
| --- | --- | --- |
| `parseHTMLIntoFragment` + `createTemplateFragment` (`wolfie-document.ts:81-147`) | ~67 | **skip** — `fragments:'tree'` means `from_html` is never used |
| `className` / `classList` / style proxy (`wolfie-element.ts:423-510`) | ~88 | **skip** — class+style merging is already centralised cross-adapter in `routeProp` (`node.ts:193-243`); reimplementing it would diverge from React/Vue/Angular |
| Eager core-node creation + `_coreDom*` (`wolfie-element.ts:378-384`, `615-689`) | ~80 | **replace** with the lazy design (§9) |
| `getBoundingClientRect` + misc DOM compat (`wolfie-element.ts:552-615`) | ~63 | **mostly skip** — measurement goes through the engine's host-instance API |
| `wolfie-action.ts`, `init-layout-tree.ts` | 111 | **wolf-tui-specific** — we need our own equivalents, not these |

Net: roughly 300-400 lines genuinely dropped, not ~820. **A realistic target is
700-900 lines**, plus tests. Treat that as an estimate, not a measurement.

**What we do need from wolf-tui's shape:** the `WolfieNode → Element / Text /
Comment / DocumentFragment` class hierarchy with prototype getters; the mutation
methods with correct DOM move semantics; `cloneNode`; `before` and variadic
`append`; `ownerDocument`; the `textContent` setter; the attribute methods; and
`addEventListener` / `removeEventListener`.

**Already free from the engine — do not reimplement:**

- move-on-insert: `appendChild` (`node.ts:278`) and `insertBefore` (`node.ts:288`)
  both call `detach` first;
- detached parent: `detach` and `removeChild` set `child.parent = **undefined**`
  (`node.ts:274,297`) — ⚠️ **`undefined`, not `null`**. A shim testing
  `parent === null` would be wrong; Svelte's `getParent`-equivalent expects a
  falsy value, so normalise at the boundary;
- comment/anchor nodes the commit walk skips: `createAnchor` / `isAnchor`
  (`node.ts:112-118`), skipped at `commit.ts:175-179`.

These are the three semantics Svelte's maintainer specifically flagged in issue
#47; all three already hold.

---

## §13. What remains UNVERIFIED

Stated honestly so nobody treats this file as uniformly evidence-backed:

- **PR #18042's metadata** (open, March 2026, 158 commits, no approving review) and
  **PR #18511**, and **issue #47's contents**. GitHub API access in the measuring
  session was scoped to `oneeyed1366/symbiote-native` only. *Indirect* corroboration
  for the load-bearing claim: the cloned 5.56.8 tree has no `customRenderer` option
  and no `svelte/renderer` export, consistent with "unmerged".
- **The 700-900 line estimate** (§12) — an estimate, not a measurement.

**Verified 2026-08-11** (previously listed here as unverified, now confirmed against
the real installed `svelte@5.56.8` and a real `tsc --build` of `adapters/svelte`):
- The `forbidSpecialElements()` preprocessor's AST assumptions — `parse(content,
  {modern: true})` really does yield `Root.fragment.nodes[].type` ===
  `'SvelteHead'`/`'SvelteWindow'`/`'SvelteDocument'`/`'SvelteBody'`; the preprocessor
  throws on each forbidden tag and passes clean markup through unchanged.
- `svelte.config.js` importing `forbid-special-elements.ts` by its real `.ts`
  extension works with zero loader/build step, because Node ≥23.6 strips erasable
  TypeScript syntax natively (confirmed against the installed Node 24.15.0). A
  `.js`-suffixed specifier pointing at nonexistent build output does NOT work.
- `tsc --build` on the package's `.ts` sources is clean after fixing real bugs the
  first run caught: missing `override` modifiers (`noImplicitOverride`), and
  `document.ts`'s generic `importNode<T extends ShimNode>` losing the concrete
  subtype through `ShimNode.cloneNode`'s abstract `ShimNode` return type — resolved
  with per-subclass overload signatures (`this`-typed return polymorphism doesn't
  work here since none of the leaf shim classes intend to be further subclassed, so
  TS can't prove a subclass override, and adding it fights the ambient
  `noImplicitOverride`/`this` interaction rather than solving anything).

**New gap found by that same verification, NOT yet fixed:** `components/index.ts`'s
`export { default as View } from './View.svelte'` compiles to `build/components/
index.js` unchanged — `tsc` never touches `.svelte` files, so the emitted barrel
still imports `./View.svelte`/`./Text.svelte` by that relative path, but nothing
copies the raw `.svelte` sources into `build/`, and `package.json`'s `"files":
["build"]` doesn't ship `src/` either. Invisible inside the pnpm workspace (`exports`
resolves `src/index.ts` directly via `workspace:*`), but a real npm/pkg.pr.new
consumer of the published tarball would get a `build/components/index.js` importing
a file that doesn't exist. No repo precedent to follow — `adapters/vue` has zero
`.vue` files in the package itself (only `.ts`/`.tsx`), so no other adapter has ever
needed to ship a non-`.ts` source file inside `build/`. Needs a decision (copy
`.svelte` sources into `build/` at publish time vs. some other mechanism) before
this package is ever actually published — tracked here, not solved yet.

**§10 status correction:** the bootstrap section header now reads "DECIDED
(2026-08-11)" — the earlier "everything in §10 is open by design" line that used to
sit here was stale by the time this line was written and has been removed.

---

## §14. Related skills and references

- `symbiote-new-adapter` — the generic "add an adapter" workflow.
- `symbiote-engine-core` — the mutation API the shim ultimately drives; note its
  comment at `node.ts:140-142` already names Svelte as a structural adapter.
- `symbiote-add-component` — the three-layer component split; Svelte's lifecycle
  layer is runes (`$state`/`$derived`/`$effect`/`$state.raw` for engine-node
  identity). **No `descriptorToSvelte` bridge is needed or planned** — see §15:
  every `core/components/src/view/render-*.ts` function produces a fixed-shape
  tree (values vary, structure never does), so each component hand-authors the
  equivalent literal Svelte markup directly, the same way View.svelte/Text.svelte
  already do, reusing only the pure logic/computation exports.
- `symbiote-web-lib-portability-check` — the project's position on web libraries
  that "work by accident"; directly relevant to §6e.
- The `examples/*` dev-harness split is RETIRED (2026-08-11, CLAUDE.md's
  `<examples_vs_dot_examples>`) — the Svelte canary lives in `examples/svelte`,
  the same single tree as every other adapter now. Local iteration against this
  package's unpublished/changed source: `pnpm pack` a tarball from
  `adapters/svelte`, point `examples/svelte/package.json` at it with `file:`,
  `npm install` inside `examples/svelte` (never `pnpm install` from repo root).
- `symbiote-dependency-catalog` — `svelte` must be added to the catalog in
  `pnpm-workspace.yaml`, never as a literal version in a package.
- GitHub issue **#47** in this repo — Svelte maintainer `benmccann` and
  custom-renderer author `paoloricciuti` offered help there; source of the original
  pointers and of the `@attach` recommendation.
- [sveltejs/svelte#18042](https://github.com/sveltejs/svelte/pull/18042) — the
  official API to migrate to once shipped.

---

## §15. Runtime execution — VERIFIED (2026-08-11), not just typechecked

Everything through §13 was proven by `tsc --build` alone — never actually run. This
section is the first REAL execution of the pipeline (`patchGlobals()` → compiled
Svelte output → shim tree → engine → Fabric), via
`adapters/svelte/src/mount-pipeline.smoke.test.ts` and
`adapters/svelte/src/components/switch/switch.smoke.test.ts`. Both pass.

### No `.svelte`-aware bundler is wired into this repo's vitest — the harness works
around it, not through one

There is no `@sveltejs/vite-plugin-svelte` in the catalog and no plan to add one for
unit tests. The harness instead: reads real `.svelte` source off disk, compiles it
with `svelte/compiler`'s `compile()` using the SAME options as `svelte.config.js`
(`generate: 'client', fragments: 'tree', css: 'external'`), writes the JS output to a
file **co-located with the real source** (not an isolated temp dir — the compiled
output's own `import { PLATFORM } from './switch-platform'` resolves relative to
wherever the compiled FILE lives, so it must sit next to the real sibling `.ts`
modules), then dynamic-`import()`s that file. Cleaned up in `afterEach`;
`.gitignore`d (`.smoke-compiled-*.mjs`) as insurance against a crash skipping
cleanup. A test needing a parent/child pair (Switch's snap-back test) compiles BOTH
and has the parent's compiled import specifier point at the child's compiled
filename directly.

### Three real bugs this caught that `tsc --build` structurally cannot

1. **`svelte`'s package.json exports split on a `browser` condition** — `.` resolves
   to `src/index-client.js` under `browser`, but to the SSR build
   (`src/index-server.js`) under `default`/`worker`, and Vite/Vitest's default Node
   conditions pick the SSR build. Calling `mount()` there throws
   `lifecycle_function_unavailable: mount(...) is not available on the server` — a
   HARD CRASH on literally the first line `render.ts`'s `mount()` executes. Fixed
   for the test suite in the root `vitest.config.ts` (`resolve.conditions:
   ['browser']` AND `ssr.resolve.conditions: ['browser']` — Vitest runs test files
   through Vite's SSR module graph, so the plain `resolve.conditions` alone was not
   enough). **Metro-side fix (2026-08-12): `examples/svelte/metro.config.js` sets
   `resolver.unstable_conditionNames: ['browser']`.** Confirmed this is genuinely
   needed, not a maybe: `@react-native/metro-config`'s own default is
   `unstable_conditionNames: []` with `unstable_conditionsByPlatform: { web:
   ['browser'] }` — the `browser` condition is ONLY applied for the `web` platform
   by default, so iOS/Android would silently resolve svelte's SSR build without this
   override (read straight out of the installed `metro-config/src/defaults/index.js`,
   not guessed). Still open: nobody has verified this against a real Metro bundle
   yet — see the `examples/svelte` bring-up work for the actual proof.
2. **`ShimNode` never implemented `remove()`** — the real `Node.prototype.remove()`
   convenience method (`this.parentNode?.removeChild(this)`), distinct from our own
   `removeChild`. Svelte's effect-teardown and anchor-management paths
   (`internal/client/reactivity/effects.js`, `dom/operations.js`) call it directly
   on the node being torn down. Missing it crashed the very first unmount/re-render.
   Fixed in `shim-node.ts`.
3. **`customElements` was never patched, and must be** — `set_custom_element_data`
   (svelte's `dom/elements/attributes.js`) reads the BARE global `customElements`
   unconditionally (`!customElements || customElements.get(...)`), with no `typeof`
   guard. An undeclared global throws `ReferenceError`, not `undefined` — so
   `patchGlobals()` MUST assign a real (fake) `CustomElementRegistry`-shaped object,
   not merely leave the global absent. RN/Hermes has no Custom Elements API to
   collide with (unlike `navigator`/`window`, both verified present at RN's own
   bootstrap — see patch-globals.ts's header comment), so this is safe to patch
   unconditionally. `get()` always returns `undefined` (we never call
   `customElements.define()`), which is exactly what steers
   `set_custom_element_data` down the object-bag "set as property" branch §3g(c)
   depends on. Fixed in `patch-globals.ts`.

A fourth item is NOT a shim bug, just a harness-fidelity gap: a bare Node/vitest
sandbox has neither `window` nor `navigator` at all, while real RN sets both before
any app code runs (verified against the vendored source — `setUpGlobals.js`:
`global.window = global`; `setUpNavigator.js`: `global.navigator = {product:
'ReactNative'}`). Every smoke test replicates this once at module scope before
touching `patchGlobals()`/`mount()`.

### Three harness gotchas, independently rediscovered by four separate agents

Worth stating once here rather than re-deriving per component:

- **`fabric.find()` (from `@symbiote-native/test-utils`) walks the CREATION log, not
  the current tree.** A node it returns stays "found" forever, even after the shim
  removes it from the live tree — its `props` reflect whatever they were at creation
  or last mutation, not necessarily what's currently committed. To assert against
  the LIVE tree (e.g. "this node is gone after a state change", or "this prop is
  CURRENTLY this value"), walk `fabric.appRoot().children` recursively yourself
  instead of trusting `fabric.find()`'s result past the first render.
- **Node's `import()` caches by file path/URL.** Writing a NEW compiled `.mjs` to the
  SAME path a previous `import()` call already used and re-importing it returns the
  STALE cached module, not the new content — even after the file on disk changed.
  Every smoke test in this adapter that compiles more than one variant (e.g. two
  differently-configured parent wrappers) gives each variant its OWN output
  filename. `switch.smoke.test.ts` gets away with one shared path per component
  because its variance travels through `mount()`'s `props` argument at runtime, not
  through different compiled source strings.
- **`root-element.ts`'s own mount target is an UNLABELED `symbiote-view` (RCTView,
  `{}` props) sitting between the AppContainer and your component's real host node.**
  A committed tree is at minimum THREE RCTView-family levels deep:
  `AppContainer(box-none) -> root mount target({}) -> your component's own root`. A
  test that searches by `viewName === 'RCTView'` alone (excluding only the box-none
  AppContainer) matches the EMPTY mount target first, since it is a plain depth-first
  pre-order search and the mount target is the shallower match — found while
  building Animated.View's own smoke tests (`adapters/svelte/src/modules/animated/
  animated-view.smoke.test.ts` and friends), where `appView().props.opacity` read as
  `undefined` even though the real node one level deeper carried the right value.
  Fix: key the search on a prop only YOUR component's root carries (a `testID` set
  in the test), not on the generic `viewName`/`pointerEvents` shape alone — the same
  discipline `activity-indicator.smoke.test.ts`'s `findLive` already uses by
  searching for a component-specific `viewName` (`'ActivityIndicatorView'`, unique
  to that component) rather than the generic `'RCTView'` every plain View/wrapper
  shares.

### The fixed-shape-render insight — no GENERIC `descriptorToSvelte` walker needed

Before writing Switch, the plan assumed React's `descriptorToReact`/Vue's
`descriptorToVue` (a generic runtime `Descriptor → element` materializer via
h()-style hyperscript) would need a Svelte equivalent, built on the shim (walk a
`Descriptor`, construct `ShimElement`/`ShimText` nodes via `document.createElement`
+ `.p =` the bag, append into a live anchor). Reading every
`core/components/src/view/render-*.ts` function that returns an `IDescriptor`
(`renderActivityIndicator`, `renderSwitch`, `renderImage`, `renderImageBackground`,
`renderInputAccessoryView`, `renderModal`, `renderTextInput`) shows each ALWAYS
produces the SAME tree shape — only prop VALUES vary (`renderSwitch` is always
exactly `el('symbiote-switch', props)`; `renderImageBackground` is always exactly a
wrapper View containing one Image, with children injected after). That part is
correct and stands: since Svelte compiles templates statically, no generic
recursive walker is needed anywhere. Lists (`FlatList`/`SectionList`/
`VirtualizedList`) have no `render-*.ts` at all (`core/components`'s own comment:
"the cell content is the framework's own children, so there is no Descriptor render
fn") — they were always meant to be hand-assembled per adapter using the
framework's native loop, which for Svelte is `{#each}`.

**CORRECTED 2026-08-12 — the conclusion drawn from that insight was wrong and shipped
a real bug.** The first pass of this section said to skip consuming a `render-*.ts`
function's output "altogether" and hand-author equivalent markup, reusing only the
pure logic pieces. That is NOT what "fixed shape" licenses: it licenses skipping the
generic WALKER, not the function CALL. `Switch/index.svelte`, `activity-indicator/
index.svelte`, and `text-input/index.svelte` were all written this way — each
hand-copied its `render-*.ts`'s prop-assembly logic (constants, fold helpers, the
exact field list) instead of calling `renderSwitch()`/`renderActivityIndicator()`/
`renderTextInput()` and destructuring the returned `Descriptor.props` onto the known
literal host tag(s). Found by re-reading the actual `.svelte` source against its
`core/components` twin (grepping for the render function's name in the `.svelte`
file — a `NONE` result on a component whose `core/components` counterpart exists is
the tell) after the user pushed back with "мы копипастим код из core/components?".
Consequence exactly as `<components_split_logic_view_lifecycle>` predicts: a future
fix to `render-text-input.ts` (shared by React/Vue/Angular) would silently NOT reach
Svelte. Fixed in all three (see their `index.svelte` for the corrected pattern): call
the `render*()` fn, get back `{type, props, children}`, and since the shape is
statically known, index straight into it —`descriptor.props` for the root,
`descriptor.children[0]` (narrowed with a `typeof child === 'string'` guard, no `as`)
for a known single child.

**One more gotcha this surfaced: `<svelte:element this={descriptor.type}>` is NOT
the bridge, even though it looks like the obvious one.** A dynamic tag compiles
through Svelte's generic `setAttribute`/property-diffing codegen, NOT the
custom-element `p=` property-SET path §3g(c) documents — so `p={descriptor.props}`
silently fails to land as a real prop when the tag is dynamic (proven by a real
regression: TextInput's controlled-write and focus/blur commands stopped firing
under `<svelte:element>`, 3 of 6 smoke-test assertions failed). The correct pattern
keeps the host tag LITERAL in the template (`{#if isMultiline}<symbiote-text-input-
multiline p={descriptor.props} .../>{:else}<symbiote-text-input p={descriptor.props}
.../>{/if}`) and only sources its **props** from the called render fn — never make
the tag name itself dynamic.

**Net effect, corrected:** none of the components need new GENERIC bridge
infrastructure to reach Svelte parity (that part of the original insight holds), but
every component whose `core/components/src/view/render-*.ts` counterpart exists
MUST call it — verify this on every new component before considering it done, not
just on the three caught here. Components without a `render-*.ts` (Pressable's
press-state machine, ScrollView's math, the list family, Button, KeyboardAvoidingView)
are correctly adapter-assembled per `component-render-fn-boundary.md`'s 3-category
rule — confirmed by reading each: they already call their core STATE/helper
functions (`highlightPressedStyle`, `backgroundProps`/`selectableBackground`,
`resolveButtonTextStyle`, the sticky-header reducer, the list reducers), just not a
`renderX()` Descriptor factory, because none exists for them by design.

### Switch as the proven reference (`adapters/svelte/src/components/switch/`)

First true state-machine component (View/Text are render-only). Structure:
`index.svelte` (markup + runes wiring) + `switch-props.ts` (type, same
plain-`.ts`-file requirement as `view-props.ts`/`text-props.ts` — see §13's earlier
verified note on named-export resolution through the `*.svelte` ambient module) +
`switch-platform.ts`/`.ios.ts`/`.android.ts` (Metro filename-selected platform
mapping, base re-exports iOS, same convention as every other adapter's Switch) +
`switch-platform-types.ts` (the shared type neither platform file imports FROM the
other). Two things `switch.smoke.test.ts` specifically proves, not just asserts in a
comment:
- **`$state.raw`, not `$state`, for the engine-node/shim-element identity** — same
  concern as Vue's `shallowRef` (documented in `adapters/vue/src/components/switch/
  shared.ts`): `$state()` deep-proxies an assigned object, and `dispatchViewCommand`
  needs the RAW `ShimElement` the engine's mirror actually knows, or every
  imperative command silently misses.
- **`bind:this` timing vs. the shim's lazy engine-node binding** — the open question
  going in was whether `hostShim.engineNode` is populated by the time the
  snap-back `$effect` first runs. It is: the shim's `insertOne()` calls
  `makeLive()` synchronously as part of the SAME `appendChild`/`insertBefore` the
  compiler emits, before `bind:this` fires. Proven, not assumed, by
  `switch.smoke.test.ts`'s second test (a "rejecting" parent that never updates
  `value`, forcing a real `dispatchViewCommand('setValue', [false])` call verified
  against a real fake-Fabric `commands` array).

Any future stateful component (TextInput, ScrollView, the List family) reaches for
an imperative host handle should follow this exact `$state.raw` + `bind:this`
pattern rather than re-deriving it.

---

## §16. Whitespace between sibling `symbiote-*` tags becomes a REAL text-node child

Found and fixed 2026-08-11 while building the List family (`adapters/svelte/src/
components/virtualized-list/index.svelte`), caught only by a smoke test asserting an
exact windowed child count, not by `tsc --build` or compile warnings.

**The mechanism (verified against the installed 5.56.8 source,
`compiler/phases/3-transform/utils.js`'s `clean_nodes`):** Svelte trims LEADING and
TRAILING whitespace of every sibling fragment, but whitespace strictly BETWEEN two
non-text sibling nodes (two adjacent elements, an element next to an `{#if}`/`{#each}`
block, two adjacent blocks) collapses to a single-space TEXT node and is KEPT — the
same rule a browser applies to literal HTML, and nothing specific to hyphenated custom
elements (an earlier hypothesis during debugging, since disproven by reading the
source: `can_remove_entirely` is false for our tags, same as any `<div>`). A
same-parent, single-child context (an element whose only content is one `{@render}` or
one nested block, e.g. `View.svelte`'s `<symbiote-view>{@render children?.()}
</symbiote-view>`) is safe — the render tag is BOTH first and last child, so the
leading/trailing trim strips the whitespace on both sides. The hazard is specifically
MULTIPLE siblings inside the same parent — exactly what `VirtualizedList`'s cell +
separator, or three top-level `{#if}` chrome blocks (header/body/footer), are.

**Why this is a correctness bug, not a cosmetic one:** the collapsed single space
becomes a REAL `document.createTextNode(' ')` call → a REAL `ShimText` → a REAL
`RCTRawText` engine node, landing as a sibling child of whatever `symbiote-*` parent
contains it. `dom-shim/text.ts`'s own header comment states raw text is only valid
inside `RCTText`; a raw-text child of `symbiote-view`/`symbiote-scroll-content` is
exactly the "text outside a Text component" shape that throws on real Fabric (the RN
error "Text strings must be rendered within a <Text> component" family). The shim
itself does not validate this (unlike the Vue adapter's `insert()`, which does — see
that comment), so it fails SILENTLY here: no compiler error, no `tsc` error, a clean
mount in every headless smoke that does not count children exactly — only a real
device, or a test asserting an exact child count, catches it.

**The fix:** eliminate ALL whitespace between sibling `symbiote-*`-producing
constructs (adjacent elements, and elements adjacent to `{#if}`/`{#each}`/`{:else}`
boundaries) at the same nesting level — pack them edge-to-edge with zero characters
between a closing tag/`{/if}`/`{/each}` and the next opening tag/`{#if}`/`{#each}`.
Whitespace INSIDE a single-child context (one element wrapping one `{@render}` or one
block) stays safe and may be formatted normally. An HTML comment (`<!-- ... -->`) is
inert here — `clean_nodes` filters `Comment` nodes out before the whitespace pass runs
(verified), so a documentation comment placed directly adjacent (no surrounding
whitespace itself) does not reintroduce the hazard; see the top of `listBody()` in
`virtualized-list/index.svelte` for the worked example and its own guard comment.

**Check on any new component with multiple sibling `symbiote-*` children in one
parent:** write a smoke test that asserts the EXACT child count (not just "greater
than zero" or "defined") — that is what caught this (10 expected vs. 24 actual in the
first `virtualized-list.smoke.test.ts` run, before the fix).

**CONFIRMED to hit APP-LEVEL composed markup too, not just adapter-internal
`symbiote-*` literal tags (2026-08-12).** Building `examples/svelte`'s canary
components (`App.svelte` + 8 demo components under `examples/svelte/components/`)
reproduced the exact same pattern using the PUBLIC component API
(`<View>`/`<Text>`/`<ActionButton>`, not raw `symbiote-*` tags): multiple sibling
components inside one `<View>`, each on its own indented line, compiled to
`from_tree([..., ' ', ..., ' ', ...])` with up to 8 stray single-space entries in one
file. This makes sense once traced through — `View`/`Text`/etc. are themselves thin
wrappers over a literal `symbiote-*` root tag, so their CHILDREN (passed as the
`children` snippet) still land inside that same custom-element codegen path one layer
down; using the framework-agnostic component API instead of the raw tag does not
exempt you. Verified via a direct script (compile each `.svelte` file, grep the
compiled output for `,\s*'\s+'\s*,` inside a `from_tree([...])` array) rather than
guessing — every file in `examples/svelte` was audited this way and fixed to 0 stray
entries. **Practical rule for `examples/svelte/**` (and any future app-level Svelte
code in this project): pack every multi-sibling region — everything between one
`<View>`'s opening tag and its closing tag when it holds 2+ children — edge-to-edge
with zero whitespace, exactly like `virtualized-list/index.svelte`'s own internal
rule.** A one-line auditing snippet (Node, given `svelte/compiler`):
```js
const { compile } = require('svelte/compiler');
const result = compile(source, { generate: 'client', fragments: 'tree', css: 'external', filename });
const strayCount = (result.js.code.match(/,\s*'\s+'\s*,/g) || []).length; // must be 0
```

**One pre-existing adapter component still has this gap, found by the same audit but
NOT yet fixed (2026-08-12), flagged rather than silently patched under time pressure:**
`adapters/svelte/src/components/scroll-view/index.svelte` compiles with exactly 1
stray-space entry. Its own test suite passes today (the affected sibling gap doesn't
happen to be counted by any existing assertion), so this is NOT blocking, but it is a
real latent bug — locate it with the audit script above, then apply the same
edge-to-edge fix, before it silently ships to a real device.

**Not just a list-family / test-harness gotcha — a real bug found in shipped
production code (2026-08-12):** `image-background/index.svelte`'s own template had
`<symbiote-image .../>\n  {@render children?.()}` — whitespace between the Image and
the live-children render call, indented normally as any reasonable formatter would
write it. Under a real compiled mount this becomes an actual `RCTRawText " "` sibling
inside a `symbiote-view` that is not a Text — the exact invalid-child case
`text.ts`'s header comment warns about. Caught only because
`image-background.smoke.test.ts` (written alongside the same-day
`renderImageBackground()` call-vs-duplicate fix) asserted the wrapper's committed
child SHAPE, not just that an Image existed. Fixed by packing the whole tag onto one
line, same as `listBody()`'s worked example. **Audit any component whose template
mixes multiple `symbiote-*` siblings with `{@render}`** — this is a live risk, not
hypothetical, and passed `tsc --build` clean before being caught at runtime.

### A SECOND whitespace bug with the same cause: INSIDE one text node (2026-08-14)

Everything above is about whitespace BETWEEN siblings. There is a separate one, found while
bringing `examples/svelte`'s canary to Vue parity: **Svelte trims a text node's leading and
trailing whitespace but never condenses the whitespace INSIDE it — unlike Vue's template
compiler, which collapses runs of whitespace including newlines.** So a sentence an author
wrapped across source lines for readability:

```svelte
<Text class="hero-body">Every @symbiote-native/svelte primitive, driven straight onto Fabric —
  no react-native renderer in the path.</Text>
```

ships its literal `\n` plus the indent into the `RCTText`. On device that is a hard line break
and a run of spaces mid-sentence where the author meant a soft wrap. It is invisible in every
headless test (the text node exists and its content matches if you compare trimmed), invisible
to `tsc`, invisible to `svelte-check`, and — importantly — **invisible to the §16 check above**,
which only ever sees text nodes that are ENTIRELY whitespace.

`scripts/audit-svelte-stray-whitespace.mjs` now runs both passes and reports them separately;
the second walks `parse()`'s AST for a `Text` node whose `data.trim()` still contains a newline.
Verified to actually fire against a synthetic wrapped-sentence component, not just to pass on a
clean tree. **Practical rule: a text node's content stays on ONE source line, however long.**

---

## §17. RESOLVED (2026-08-12) — `ShimNode.before()` threw instead of no-op on a parentless node

Found 2026-08-11 during post-integration verification (running every parallel agent's
smoke tests together); root-caused and fixed 2026-08-12 while building `createTunnel`
(a SEPARATE feature, hit the identical crash signature independently — see the repro
below and `create-tunnel/create-tunnel.test.ts`'s own history).

**Root cause**: `shim-node.ts`'s `before()` THREW when `this.parent === null`. The real
DOM spec says otherwise — `ChildNode.before()`'s steps are literally "let parent be
this's parent; if parent is null, then return" (a silent no-op, not an exception).
Svelte's own `BranchManager` (`svelte/internal/client/dom/blocks/branches.js` — the
machinery behind `{#each}`/`{#if}`/`{@render}`'s DEFERRED/batched updates, used whenever
a block updates OUTSIDE the initial synchronous mount pass) genuinely relies on this
spec no-op: it allocates an offscreen `DocumentFragment` + a placeholder anchor
(`create_text()`), schedules the real content to render into that anchor via
`branch(() => fn(target))`, and SEPARATELY may promote/discard that offscreen fragment
via `#commit`'s `offscreen.fragment.lastChild.remove()` — which can detach the
placeholder anchor BEFORE the scheduled effect actually runs its own
`anchor.before(realContent)` call. In real DOM this races harmlessly (the stale
`.before()` call is simply dropped); this shim's throw turned that harmless race into a
hard crash.

**Fix**: `before()` returns early (spec no-op) instead of throwing when parentless —
one line, `shim-node.ts:114`.

**Proven by both a minimal isolated repro AND the real bug**: a throwaway
`{#each map as [id, content] (id)}{@render content()}{/each}` component, mounted with
the map populated SYNCHRONOUSLY (parent script, before mount) — passes both before and
after the fix. The SAME component with the map instead populated via a POST-MOUNT
`$effect` (e.g. `$effect(() => { items.set(1, a); items.set(2, b); })`) — crashes with
the exact §17 signature before the fix, passes clean after. This is the general
condition: **any component populating a reactive `{#each}`-driven list from an effect
that runs after the initial mount** (not just VirtualizedList's specific windowing math,
not just `createTunnel`) was exposed to this — an extremely common pattern (e.g. any
list backed by an async fetch), so this was not a narrow edge case.

**Verified**: full repo-wide `npx vitest run` — 1906/1910 passing (the remaining 4 are
the pre-existing, unrelated `less`-package-not-installed failures in
`core/css-parser`), zero unexpected errors. `adapters/svelte` alone: 16 test files, 45
tests, 0 errors — the VirtualizedList window-growth test's previously-logged uncaught
exception is GONE, not just tolerated.

Original repro record kept below for anyone cross-checking the signature.

**Repro:** `adapters/svelte/src/components/virtualized-list/virtualized-list.smoke.test.ts`'s
second test ("grows the window toward the target as onLayout reports a real
viewport") — mount `VirtualizedList` with 100 items and an empty cell snippet, fire a
real `topLayout` event on the scroll view (300×600), await two macrotask ticks. The
test's own assertions PASS (the windowed child count really does grow past the
pre-layout `initialNumToRender` bound), but vitest ALSO reports one uncaught
exception per run:
```
Error: ShimNode.before() called on a node with no parent
  at ShimText.before shim-node.ts:115
  at .../virtualized-list/.smoke-compiled-virtualized-list.mjs:217  ($.append($$anchor, fragment_3), inside the `{#each plan.cells as cell (cell.key)}` block)
```

**Ruled out, with direct evidence, not just reasoning:**
- **NOT a `batchTimer`/`viewableTimer` leak past `unmount()`.** Instrumented both the
  `schedule-refill` timer-set call and the destroy-effect's cleanup with logging:
  `batchTimer`/`viewableTimer` were `null` at cleanup time in every run — the
  `schedule-refill`/`fire-viewable` effect branches never fired at all during this
  test. Ruled out by direct observation, not inference.
- **NOT caused by `unmount()`/teardown.** Reproduces identically with the test's
  `afterEach` unmount call temporarily removed entirely (component left mounted,
  never torn down) — same error, same location, same "grows the window" test.
- **NOT a settle-time/impatience issue.** Reproduces identically with the two
  `await tick()` calls (macrotask, 0ms) replaced by a single 400ms wait.
- **NOT cross-test leakage.** Reproduces running ONLY this one test in isolation
  (`vitest run ... -t "grows the window"`, the sibling test skipped).

**What that leaves:** the crash happens somewhere in the SAME synchronous-or-microtask
window as the `topLayout`-triggered re-render itself (the `{#each}` block growing from
`initialNumToRender` cells to covering the whole unmeasured viewport in one pass, per
the test's own comment) — not from anything this adapter's own code schedules
asynchronously. The failure site (`$.append($$anchor, fragment_3)` inside the keyed
`{#each}`'s per-item render callback, immediately preceded in the compiled output by
an `$.if(...)` handling the optional per-cell separator) suggests an ordering issue
between the OUTER each-block's keyed diff and an INNER conditional block's own anchor
management when a large number of cells are inserted in a single pass — but this is
not confirmed, only the most likely remaining explanation given everything else ruled
out above. Diagnosing further would need either instrumenting Svelte's own compiled
`{#each}`/`{#if}` internals directly, or a minimal non-Symbiote reproduction against
real DOM/jsdom to determine whether this is Svelte-core behavior our shim merely
exposes (most likely, given the shim's `insertBefore`/`removeChild ` implementations
are the same ones every other passing smoke test already exercises) or a shim gap
specific to large-batch insertion.

**Practical impact right now:** the windowing math itself is proven correct (the
test's assertions pass); this is an async exception logged alongside a passing test,
not a failed assertion. Given `DEFAULT_MAX_TO_RENDER_PER_BATCH` normally grows a
window incrementally (10 cells at a time) rather than in one large jump — the shape
this specific test drives via a single big `topLayout` delta specifically to prove
"windowing is live," not the typical incremental-scroll case — this may be narrower in
practice than the test makes it look. Still: DO NOT clear this line without either
fixing it or getting a real repro on-device proving it does not occur there.

---

## §18. Known gaps across the 2026-08-11 full-component-parity batch

19 components (ActivityIndicator, Image, ImageBackground, InputAccessoryView,
KeyboardAvoidingView, Switch, TextInput, Modal, SafeAreaView, RefreshControl,
Pressable, TouchableOpacity/Highlight/WithoutFeedback/NativeFeedback, Button,
ScrollView + sticky headers, VirtualizedList, FlatList, SectionList,
VirtualizedSectionList) went in via 6 parallel agents in one session, each pointed
at Switch as the proven reference and told to report honest gaps rather than ship a
silently-reduced surface. `tsc --build` is clean and every component's own smoke
test passes (see each `*.smoke.test.ts`). Cross-cutting gaps, consolidated here so
they don't get lost in six separate agent transcripts:

- **No `Animated.View` (or any native-Animated binding) exists yet for this
  adapter.** Flagged independently by BOTH the Touchable batch (TouchableOpacity's
  press-fade is a self-contained `setTimeout`-driven tween reproducing
  `Animated.timing`'s curve, NOT wired into the native Animated node graph — no
  `useNativeDriver` capability) and the ScrollView batch (sticky headers render the
  reducer's debounced `translateY` as a plain style update, stepped rather than
  per-frame-smooth). Building a real Svelte `Animated.View` binding is prerequisite
  work for both to reach true parity, not a Svelte-specific problem — it's simply
  not been ported yet.
- **`core/components/src/view/render-image/index.ts`'s prop-mapping helpers are
  module-private** (`normalizeSource`, `headersFromAliases`, `expandSrcSet`,
  `resolveSourceArray`, `readStyleString`, `readSourceUri` — not exported even from
  that file). `renderImage()` itself IS called from `image/index.svelte` (verified
  2026-08-12 — this one is fine); the private helpers are a separate, narrower gap:
  code inside `render-image/index.ts` that `renderImage()` calls internally but that
  a hand-written skeleton for a DIFFERENT component (or a future generic bridge, see
  §19) can't reach without its own copy. Recommend exporting these from
  `render-image/index.ts` (not necessarily the top barrel) so nothing has to
  triple-duplicate the same logic.
- **ScrollView has no RefreshControl/`onContentSizeChange` wiring INSIDE
  VirtualizedList's own minimal scroll host** — VirtualizedList was built before
  ScrollView landed (parallel agents), so it hand-authors a deliberately reduced raw
  `symbiote-scroll-view` host rather than rendering the real `ScrollView` component.
  Now that `ScrollView` exists (`adapters/svelte/src/components/scroll-view/`),
  swapping VirtualizedList to render it (picking up RefreshControl,
  `onContentSizeChange`, and native sticky-header wrapping for free) is follow-up
  work, not done yet — a comment to this effect is already left in
  `virtualized-list/index.svelte`.
- **`stickyHeaderIndices`/`invertStickyHeaders` auto-wrap is not implemented** on
  ScrollView — Svelte hands a component only an opaque `Snippet`, with no
  `Children.toArray`(React)/`slots.default()`(Vue) equivalent to mechanically pull
  "child at index N" out of it. Compose `ScrollViewStickyHeader` manually instead
  (the sticky-header Svelte context auto-wires it to the parent's scroll offset, so
  this is low-friction, just not automatic).
- **RESOLVED (post-2026-08-11): `RefreshControl.svelte` now has a `style` field**
  (`refresh-control-props.ts`), so ScrollView's Android RefreshControl wrap DOES
  split layout-vs-visual style via `splitLayoutProps`, the same as elsewhere
  (`scroll-view/index.svelte`: `layoutSplit = shouldWrapRefreshControl ?
  splitLayoutProps(...) : undefined`, applied as `style={layoutSplit?.outer}` on
  the wrapping `<RefreshControl>`). This paragraph originally flagged the gap as
  open; verified closed 2026-08-15 while auditing `api/components.mdx` for the
  docs-site Svelte-parity sweep — kept here (not deleted) as a record that the
  gap existed and was later closed, per this skill's "logs are an asset, never
  deleted" convention.
- **SectionList/VirtualizedSectionList and multi-column FlatList are compile-verified
  only** (via `svelte/compiler` directly), not execution-verified by a smoke test —
  unlike VirtualizedList/FlatList's single-column path, which caught a real bug
  (§16) specifically BECAUSE a smoke test existed. Real bugs could still be lurking
  there the same way.
- **§15's Metro-side `browser`-condition fix is now applied** (2026-08-12,
  `examples/svelte/metro.config.js`) alongside a real `metro-svelte-transformer.cjs`
  (`adapters/svelte/metro-svelte-transformer.cjs`, exported as
  `@symbiote-native/svelte/metro-svelte-transformer` — the Svelte twin of
  `adapters/vue/metro-vue-transformer.cjs`: `svelte/compiler`'s `compile()` with this
  adapter's own `{fragments:'tree', css:'external', generate:'client'}`, no framework-
  import rewriting needed unlike Vue, delegated to `@react-native/metro-babel-
  transformer` via `resolveUpstreamTransformer()`). Unit-tested
  (`adapters/svelte/metro-svelte-transformer.test.ts`, 6 tests: client-runtime-only
  import, `from_tree` not `from_html`, `set_custom_element_data` routing, TS erasure
  with no filesystem resolution needed, full transform() through the upstream
  transformer). **VERIFIED end-to-end (2026-08-12)**: `examples/svelte` (a minimal
  canary — `View`/`Text`/`Switch`/`Pressable`/`ScrollView`, no navigation/third-party
  native views yet, per explicit project scoping) built via a real local tarball
  (`pnpm pack` from `adapters/svelte` + `file:` dependency, per
  `<examples_vs_dot_examples>`) and bundled headlessly with the real RN CLI —
  `npx react-native bundle --platform ios|android --entry-file index.js` — on BOTH
  platforms, zero transform errors. Confirmed the output bundle contains
  `svelte/internal/client` + `from_tree`/`set_custom_element_data` calls and
  contains NO `lifecycle_function_unavailable` (the SSR-build crash string), proving
  `unstable_conditionNames: ['browser']` actually resolved the client build on a
  real Metro run, not just in Vitest. `svelte-check` on the example: 385 files, 0
  errors, 0 warnings. Real simulator/device boot is the next stretch goal, not done
  in this pass — a headless bundle is not proof the app actually renders on-device.

  **A second real bug this surfaced, orthogonal to the `browser`-condition one**:
  `tsc --build` silently DROPS every `.svelte` file — it only ever emits
  `.ts`→`.js`/`.d.ts`, so `adapters/svelte/build/components/switch/` had every
  sibling `.ts` file compiled but no `index.svelte` at all, even though the
  package's own compiled barrel (`build/components/index.js`) still literally
  contains `export { default as Switch } from './switch/index.svelte'` — `tsc`
  passes the specifier through unresolved without erroring (an ambient `declare
  module '*.svelte'` satisfies its type check) but never copies the file the
  specifier points at. Exit code 0, no warning — this is NOT the same gap as
  Vue's: Vue's own components are plain `.ts`/`.tsx` render functions
  (`adapters/vue/src/components/switch/index.ts`), so Vue never hits this; Svelte
  has no non-SFC authoring form, so every one of this adapter's own 24 components
  IS a `.svelte` file that must ship as raw source for a CONSUMING app's own Metro
  transformer to compile (same principle as `examples/vue-sfc`'s own `*.vue`
  screens shipping as raw source, one layer inward). Fixed generically — not
  Svelte-specific by name — via `scripts/copy-svelte-sources.mjs` (mirrors
  `scripts/fix-esm-extensions.mjs`'s pattern: discovers every publishable package
  via `publishablePackageEntries()`, copies any `src/**/*.svelte` to the matching
  `build/` path), wired into root `prepublish-build` right after `fix-esm-
  extensions`. A future package authored the same way is covered automatically.

## §19. `descriptorToSvelte` — BUILT (2026-08-12): `adapters/svelte/src/descriptor-to-svelte.ts`

A real generic bridge exists now: `mountDescriptorChildren(parent, children)` in
`descriptor-to-svelte.ts` — shape-stable (create each shim node ONCE, cache it by
tree position, `update()` only re-sets `.p`/`.data` on the SAME already-live
nodes — never `removeChild`+recreate), proven against the real engine in
`descriptor-to-svelte.test.ts` (4 tests: initial commit, no-recreate-on-update via
`counts.createNode`, multi-level nested sync, and a shape-change throws rather than
silently rebuilding). Retrofitted into `activity-indicator/index.svelte` as the
first real caller (replacing its hand-derived `spinnerBag` + hand-written child
tag) with its own new smoke test (`activity-indicator.smoke.test.ts` — the
component had NONE before this, closing a §18 gap in passing). The root element
stays a literal template tag (`<symbiote-view p={descriptor.props} bind:this=
{hostShim} />`) — only children beneath it go through the bridge, since `bind:this`
needs a statically-known tag; see the design rationale below for why this is
sufficient. `mountDescriptorChildren`'s own test caught a real assertion mistake
worth remembering: `fabric.find()` returns the CREATION-log node, whose `.props`
never reflect a later clone (§15's documented gotcha) — a live-value assertion
after an update must walk `fabric.appRoot()` recursively instead (`findLive` helper
in `activity-indicator.smoke.test.ts`), exactly as §15 already warns.

**Updated same day, per explicit user direction: use the bridge uniformly, matching
React/Vue, not only where it saves lines.** The first pass here reasoned Switch and
TextInput didn't need it because their `render-*.ts` Descriptors have ZERO
children — true, but the wrong bar: React still routes a childless Switch through
`descriptorToReact(useSwitchLogic(...))` rather than special-casing it, because the
point is ONE uniform shape for every category-1 component, not "only bother when it
saves code." `createDescriptorChildrenSync()` (a thin wrapper around
`mountDescriptorChildren` that tracks the `mounted` handle across calls — the
repeated `if (mounted === undefined) ... else ...` boilerplate every retrofit was
rewriting by hand) now backs Switch, TextInput, AND ActivityIndicator identically:

```ts
const syncChildren = createDescriptorChildrenSync();
$effect(() => { syncChildren(hostShim, descriptor.children); });
```

For Switch/TextInput this is a provably harmless no-op loop over an empty array
(covered by its own test: "is a harmless no-op loop for an always-empty children
array"), kept for uniformity, not because it does anything. Root tags stay literal
in the template either way — `bind:this` needs a statically-known tag, and (see
below) a dynamic `<svelte:element>` root breaks the custom-element property-set
path — so "uniform" means every category-1 component's INSTANCE script ends the
same way (`renderX()` → `createDescriptorChildrenSync()` wiring), not that the root
tag itself becomes generic.

**Also found and fixed in the same pass: `image-background/index.svelte` was NOT
calling `renderImageBackground()`** — a 4th instance of the exact copy-paste-instead
-of-calling bug (after Switch/ActivityIndicator/TextInput), caught by re-auditing
every `render-*.ts` caller against its `.svelte` file. NOT retrofitted onto the
bridge itself, though: its wrapper hosts `{@render children?.()}` as a live sibling
AFTER the inner Image, and appending the Image inside an `$effect` (which runs after
Svelte's own placement of the live children) would risk reordering them ahead of
where they belong — so both tags stay literal, sourcing their props from
`renderImageBackground()`'s Descriptor, same pattern as Modal. Fixing it also
surfaced a REAL (not just test-harness) instance of §16's whitespace bug — see that
section's addendum.

### Original design rationale (below, kept for the reasoning trail)

§15's "fixed-shape-render insight" concluded no generic bridge was needed AT ALL,
reasoning that Svelte compiles templates statically so a runtime `Descriptor` walker
has nowhere to plug in (unlike React's `createElement`/Vue's `h()`, both runtime
calls). That reasoning has a hole: it only considered routing the walker's OUTPUT
back through Svelte's own COMPILED template codegen (`<svelte:element this={type}
p={props}>`) — proven broken in §15's `svelte:element` gotcha, since a dynamic tag
compiles through the generic `setAttribute` path, not the custom-element `p=`
property-set path. It did not consider bypassing Svelte's template codegen
entirely and building the subtree with PLAIN IMPERATIVE JS instead, the same way
`init_operations`/`from_tree` already do internally.

`~/personal/projects/wolf-tui/packages/svelte/src/wnode/wnode-to-svelte.ts` does
exactly this, in production, today:

```ts
export function wNodeToSvelte(node: WNode): WolfieElement {
  const el = new WolfieElement(node.type)
  if (node.props.style) setStyle(el.domElement, node.props.style)  // bypasses Svelte's setAttribute
  for (const child of node.children) {
    el.appendChild(typeof child === 'string' ? new WolfieText(child) : wNodeToSvelte(child))
  }
  return el
}
```

wired into ONE Svelte component via a single `use:` action on an anchor tag
(`wnode-to-svelte.ts`'s `mountWNode`): the action's `update(newWNode)` rebuilds the
whole subtree and re-parents it into the anchor container on every change. `use:`
actions receive the raw DOM node and rerun `update()` on every parameter change —
entirely outside Svelte's attribute/property compile-time heuristic (confirmed
against Context7's `/sveltejs/svelte` docs: "Any properties and event listeners
applied to `<svelte:element>` will be correctly passed... `bind:this` [is] the only
Svelte-specific binding" — actions are a separate, generic mechanism that works on
ANY element, static or dynamic tag alike).

**The equivalent for us**, if adopted:

```ts
function descriptorToSvelte(node: IDescriptor): ShimElement | ShimText {
  if (typeof node === 'string') return document.createTextNode(node)
  const el = document.createElement(node.type)   // our own document shim, not Svelte's
  el.p = node.props                              // our object-bag setter, already proven
  for (const child of node.children) el.appendChild(descriptorToSvelte(child))
  return el
}
```
mounted via one `use:mountDescriptor={renderX(viewProps, platform)}` action per
component, instead of each component hand-writing a markup skeleton that mirrors
its `render-*.ts`'s known shape.

**RESOLVED 2026-08-12 — stick with the current approach; the rebuild cost is a
property of `wnode-to-svelte.ts`'s specific implementation, not of building a
generic bridge per se, and it does not apply to us.**

`mountWNode`'s `update()` tears down and rebuilds the WHOLE subtree on every
change because it is GENERIC over an arbitrary, possibly-varying WNode shape (a
wolf-tui `<Table>` can have any number of rows) — it has no way to know what
changed, so it rebuilds everything to be safe. Our components are different: the
fixed-shape-render insight (§15) means every category-1 `render-*.ts`'s Descriptor
tree shape (node types, depth, child count) is provably CONSTANT across every
render — only prop VALUES vary. The current per-component skeleton already
exploits this for free: `<symbiote-switch p={descriptor.props} bind:this={hostShim}
/>` is ONE literal, statically-declared tag; `bind:this` fires once on mount, and
every subsequent reactive update just assigns a new value to that SAME node's `p`
property (diffed per-key by `routeProp`) — Svelte's ordinary fine-grained template
reactivity, not a subtree rebuild. Same cost profile as React's "clone this one
node with new props," not wolf-tui's "destroy and recreate." A rebuild would also
have been a correctness bug, not just a perf one: it would break `$state.raw`'s
whole reason for existing (a STABLE `ShimElement` for `dispatchViewCommand` /
focus-tracking across renders, exactly what Switch's snap-back and TextInput's
focus/blur handling depend on).

Confirmed against the actual history of Svelte's own official custom-renderer PR
(#18042, Paolo Ricciuti/Mainmatter — https://mainmatter.com/blog/2025/05/22/
native-apps-with-svelte/): their FIRST attempt was literally our dom-shim strategy
("Mom, can we have DOM? We have DOM at home!" — wrap elements in an HTML-compatible
API and let the stock client runtime run unmodified). It worked, but DOM quirks
(`div.innerText = ''` cascading to remove every child, etc.) made it fragile, so
they moved the seam into the COMPILER instead: `operations.js` centralizes every
DOM operation as an exported function the compiler calls directly, so a custom
renderer gets Svelte's own SURGICAL per-operation calls (one `create_element`, one
property set) — never a re-walk of anything. That is the same cheap, no-rebuild
cost profile our current approach already has; the official API will eventually
deliver it "for free," so there is no urgent reason to build a generic bridge now
purely to save the per-component skeleton line count.

**Built 2026-08-12, per the user's explicit request** (to keep the design DRY
against reinventing the same skeleton per component, not for cost — cost was
already fine either way): NOT `wnode-to-svelte.ts`'s rebuild-every-time shape.
`descriptor-to-svelte.ts`'s `mountDescriptorChildren` is the shape-stable walker
this section called for — see the summary at the top of §19 for what it does and
where it's used.

None of these are silent — each is `dlog`'d and/or comment-flagged at its exact
location in the source, per this file's own `<keep_logs_gate_behind_DEBUG>` /
honesty conventions.

## §20. `Animated` — BUILT (2026-08-12): `adapters/svelte/src/modules/animated/`

Ported from `adapters/vue/src/modules/animated/` (the primary reference — Svelte 5
runes are much closer to Vue's reactivity model than to React's hooks). The value
graph, easing, interpolation and drivers are `@symbiote-native/engine`'s
`core/engine/src/animated/*`, spread in verbatim and never reimplemented.

**No generic `createAnimatedComponent(Component)` exists on this adapter — a real
scope boundary, not an oversight.** Vue wraps an arbitrary base component via
`h(Component, reducedProps)`; React via `createElement(Component, childProps)` —
both ordinary runtime calls that work on any component reference. A compiled
Svelte component is not such a value: wrapping one means literally authoring
`<Component {...props} bind:this={ref}>` inside another `.svelte` file, so each of
the four components (`AnimatedView`, `AnimatedText`, `AnimatedImage`,
`AnimatedScrollView`) is its OWN hand-authored `.svelte` file, sharing only the
non-visual reconcile logic (`animated-props-runtime.ts`'s
`createAnimatedReconcileRuntime` — the Svelte twin of Vue's
`reconcile()`/`detachEvents()`, factored into a plain non-reactive helper). A
consumer wanting to animate their own custom component follows the same
four-file shape by hand rather than reaching for a generic wrapper.

**Two different composition strategies, chosen per base component's own escape
hatch — not a uniform recipe:**

- `AnimatedView` / `AnimatedText` HAND-AUTHOR their own root tag (`<symbiote-view
  p={reduced} bind:this={hostShim}>`), mirroring `Pressable`/`ScrollView`'s own
  precedent for needing a raw `ShimElement`. Safe here because `View.svelte` /
  `Text.svelte` are pure pass-through bags with zero prop transformation of their
  own — hand-authoring loses no logic.
- `AnimatedScrollView` WRAPS the real `ScrollView.svelte` directly (`<ScrollView
  {...reduced} bind:this={scrollRef}>`), because `ScrollView.svelte` already
  exposes `getScrollNode()` (+ `scrollTo`/`scrollToEnd`/`flashScrollIndicators`)
  via top-level `export function`s — exactly the `IScrollViewHandle` shape
  `resolveHostNode` expects on Vue/React. Hand-authoring a reduced duplicate here
  would have silently dropped sticky headers, RefreshControl, and
  `maintainVisibleContentPosition` — a real `<adapters_reach_full_feature_parity>`
  violation the wrap avoids. `AnimatedScrollView` forwards its own imperative
  handle (`scrollTo`/`scrollToEnd`/`flashScrollIndicators`/`getScrollNode`) by
  delegating to the captured `scrollRef`, the Svelte twin of Vue's delegating
  Proxy `expose()`.
- `AnimatedImage` hand-authors its root tag too, but — unlike View/Text — calls
  the REAL `buildImageBag()` (`components/image/image-logic.ts`) with rasterized
  field values, because `Image.svelte` does real prop transformation (source
  resolution, resizeMode/tintColor read off style, width/height fold,
  alt→accessibility) that a bare pass-through bag would silently drop — the same
  copy-paste-instead-of-calling bug class §15/§19 already caught on
  Switch/ActivityIndicator/TextInput/ImageBackground. Known, INHERITED (not
  Svelte-specific) limitation: `AnimatedProps`'s per-frame path
  (`update() -> setNativeProps`) pushes the raw `rest` fields directly, bypassing
  `buildImageBag` — same on Vue/React, since `AnimatedProps` is framework-agnostic
  and has no notion of a component's own prop transform. Only matters if a
  non-`style` field (e.g. `source`) is itself animated, which is not a supported
  use; animating `style` (opacity/transform) round-trips correctly since
  `buildImageBag` keeps `style` under the same key name.

**A recurring TS bridge worth naming once:** `reduceProps()` returns
`Record<string, unknown>`, so every rasterized field is `unknown` even though it
is, at runtime, exactly the shape a strictly-typed prop interface
(`IImageViewProps`, `IScrollViewProps`) declares. Bridged back without an `as`
cast via `Object.assign(Object.create(null), rasterizedFields)` — `Object.create
(null)` types as `any`, so `Object.assign`'s result does too, and TS allows
binding `any` into a specifically-typed variable. Same pattern React's
`create-animated-component.tsx` already establishes (`Object.assign(Object.create
(null), reduced, {ref: captureRef})`); reused here for `AnimatedImage`'s
`IImageViewProps` and `AnimatedScrollView`'s `IScrollViewProps`.

**`Animated.FlatList` / `Animated.SectionList` are NOT implemented in this
pass.** Vue omits them because it has no `FlatList`/`SectionList` base component
at all; Svelte DOES have both (built in the 2026-08-11 parallel batch, §18), so
this is a narrower, more honest gap than Vue's — flagged as follow-up, not
silently dropped. Wrapping them would follow the exact same
wrap-the-real-component-via-its-exported-handle shape `AnimatedScrollView` uses,
once each is confirmed to expose (or is given) an equivalent handle.

**Verified 2026-08-12** against the real compiler (not just `tsc --build`):
`animated-native-driver.test.ts` / `animated-native-event.test.ts` (the Svelte
twins of Vue's own two files — native `useNativeDriver:true` mirrors the value
graph into native and binds `connectAnimatedNodeToView`/`addAnimatedEventToView`
to the COMMITTED view's real Fabric tag, via a fake `NativeAnimatedTurboModule`),
`animated-view.smoke.test.ts` (plain JS-driven `Animated.Value`/`setValue`
re-paint, no native module installed), `animated-image.smoke.test.ts` (proves the
`buildImageBag` routing — a hand-rolled bag would have shipped `source` as a bare
object instead of the array `RCTImageView` expects), `animated-scroll-view.smoke.
test.ts` (proves the wrap preserves the full `RCTScrollView`/`RCTScrollContentView`
shape and forwards the imperative handle).

**A harness-navigation gotcha found while writing these tests, not previously
recorded:** see the "Three harness gotchas" list above (§15) —
`root-element.ts`'s own mount target is an unlabeled `symbiote-view` that a naive
`viewName === 'RCTView'` search matches before reaching the actual component
under test.

## §21. `examples/svelte` — a FULL 1:1 port of `examples/react/screens/CanaryScreen.tsx`, BUILT (2026-08-12)

Started as an explicit "minimal canary" scoping decision, then extended to a full
port on direct user request ("всё 1-в-1, включая недостающие подсистемы") — build
whatever subsystems were missing rather than stub the screen down. What that
actually required, built this session on top of the M1-established component
parity:

- `Animated` (View/Text/Image/ScrollView + the full driver namespace) — §20.
- `@symbiote-native/slider`'s Svelte variant (`packages/slider/src/svelte`) — the
  third-party-native-view wrapper pattern (ViewConfig-derived at runtime, no
  React component import) extended to a fourth framework; the native `RNCSlider`
  leaf routes through `@symbiote-native/svelte/native-view-bridge`'s
  `mountDescriptorChildren` since a non-hyphenated, non-lowercase-leading tag
  name compiles as a component reference, not an element, in a Svelte template.
- `createTunnel` (Svelte twin of `adapters/vue/src/create-tunnel`, API shape
  necessarily different — see `create-tunnel/tunnel.ts`'s header — Svelte
  components can't be manufactured per-call the way `defineComponent` allows).
  `createPortal` has NO Svelte twin, matching Vue's own precedent: it's
  react-reconciler's own Fiber-level `HostPortal` primitive, no equivalent
  exists in a framework with no reconciler.
- Every plain engine re-export module the barrel was still missing: `Alert`,
  `Vibration`, `Share`, `Linking`, `ActionSheetIOS`, `AppState`, `Keyboard`,
  `I18nManager`, `Settings`, `AccessibilityInfo`, `PanResponder` — all ~5-15
  line files mirroring React's own re-export shape exactly.
- `StatusBar` — the one runtime module needing a real declarative half (renders
  nothing, re-applies props via `$effect` — the Svelte twin of Vue's
  `watchEffect`-based version).
- `useWindowDimensions`/`useColorScheme` — a NEW adapter bucket, `runes/`
  (`*.svelte.ts` files), Svelte's own term for `$state`/`$effect`, parallel to
  React's `hooks/` and Vue's `composables/`. Returns a boxed getter object
  (`{ get current() {...} }`), not a bare `$state` — Svelte 5 reactivity does
  not survive being returned as a raw value from a plain function.
- `hostInstance()` + a fix in `dom-shim/element.ts`'s `createEngineNode()`: every
  host node now gets `toPublicInstance()` grafted at creation (measure/
  measureInWindow/measureLayout/setNativeProps/focus/blur) — this was NEVER
  wired for Svelte before this session (Vue's renderer does it at its own
  commit point; Svelte's shim had no equivalent step), so `RefApiDemo`'s
  imperative ref API was silently unimplementable until this fixed it.
  `IFlatListHandle`/`IVirtualizedListHandle`, `ShimElement`, and `ISection`
  were also missing from the public barrel — added.
- The 8 demo components (`AnimatedDemo`, `AnimatedParityDemo`,
  `NativeModulesDemo`, `RefApiDemo`, `PlatformColorDemo`, `AccessibilityDemo`,
  `ResponderDemo`, `ParityDemo`) + `ActionButton`, each a close port of its
  React source under `examples/svelte/components/`.

**A second, independently-discovered instance of §16's whitespace-collapse bug,
this time at the APP level, not just adapter-internal `symbiote-*` tags** — see
§16's own addendum for the full writeup and the one-line audit script. Every
file in `examples/svelte` was audited and fixed to 0 stray-space entries;
`adapters/svelte/src/components/scroll-view/index.svelte` still has 1 unfixed
(flagged, not blocking — its own test suite doesn't happen to assert the
affected child).

**A real, still-open parity gap found via `svelte-check`, not silently
worked around:** `IVirtualizedListProps`/`IFlatListProps`/
`IVirtualizedSectionListProps` do NOT extend `IAccessibilityProps`/
`IAriaProps` the way React's do — no `testID`, no `accessibilityLabel`, no
aria-* passthrough on any list component. `examples/react/screens/
CanaryScreen.tsx` passes `testID="chips-list"` to its FlatList and
`testID="sticky-section-list"` to its SectionList; both were DROPPED from the
Svelte port rather than adding a type-only fix that wouldn't actually forward
the field (the components read named fields off `props` directly — `let props:
IProps<ItemT> = $props()`, no rest-spread — so widening the type alone would
silently lie; the real fix needs the prop actually threaded into the host bag
too). Follow-up, not done this session.

**Full verification, both platforms, all pieces integrated together**:
`pnpm pack` fresh tarballs for both `@symbiote-native/svelte` (32 `.svelte`
files now under `build/`, up from 24) and `@symbiote-native/slider`, a real
`npm install` in `examples/svelte` against both, `svelte-check`: 430 files, 0
errors, 0 warnings. `npx react-native bundle --platform ios|android` on the
FULL assembled `App.svelte` (not the minimal canary): zero transform errors on
both platforms; confirmed the output bundle contains `svelte/internal/client`
(44 hits), `RNCSlider`, `startAnimatingNode` (the native Animated driver call),
and both `TunnelIn`/`TunnelOut` — proof every subsystem actually reached the
bundle, not just compiled in isolation. Repo-wide `npx vitest run`: 1923/1927
(same 4 pre-existing, unrelated `less`-package failures), zero regressions.
Real simulator/device boot remains the next, not-yet-taken step.


## Sticky headers must ride the NATIVE driver — never force the JS path (2026-08-13)

`nativeStickyAvailable` is resolved dynamically in both `scroll-view/index.svelte` and
`virtualized-list/index.svelte`, mirroring React (`hasStickyHeaders && isNativeAnimatedAvailable()`).
It was previously hardcoded `false`, and that single line was the Android sticky failure.

The reasoning that led there was half right. The observation is real and device-confirmed: attach
the scroll value to the native driver up front and the sticky header's interpolation listener never
fires again, because `AnimatedWithChildren.__callListeners` stops cascading into a native subtree.
The wrong step was concluding the header therefore needs the JS path.

**Check RN before treating an engine behavior as a defect.** RN carries the identical gate
(`AnimatedWithChildren.js:74 if (!this.__isNative)`), and native-to-JS value streaming
(`startListeningToAnimatedNodeValue`) lives ONLY on `AnimatedValue`, never on an interpolation node
— so that listener is silent under RN too, and RN's sticky headers work regardless. The reason:
**the listener never drove the pin.** The visible pin IS the native transform; the listener only
feeds the debounced committed transform used for hit-testing, which is why
`ScrollViewStickyHeader.js` registers it solely `if (isFabric)`.

Forcing the JS path to keep that listener alive trades the whole native driver for a hit-testing
detail and puts the pin on the JS thread. Symptom split by platform, because the commit debounce is
platform-specific (`render-scroll-sticky.ts`): 64ms on iOS so the pin merely drifts and reads as
"mostly fine"; 15ms on Android where it fails outright. **A platform-split symptom in an otherwise
shared component points at a platform-tuned constant, not at framework-specific code.**

Locked in by `core/engine/src/animated/sticky-native-promotion-listener.test.ts`, a CHARACTERIZATION
test asserting the listener DOES go quiet after promotion. It looks like it is asserting a bug; it
is asserting RN parity. Do not "fix" the engine to make it tick — that is the divergence, and it
would re-open the door to hardcoding the JS path again.


## Never store Svelte's rest-props object as "previous state" (2026-08-13)

Svelte hands a component the **same** rest-props object on every reactive tick — it mutates what
the keys resolve to instead of allocating a new one. Any memo/skip/dirty-check that keeps `rest`
itself as its previous value therefore compares that proxy **against itself**, reading the same
current values through both sides, and can never report a change:

```ts
lastRest = rest;                                   // WRONG — same proxy next tick
const changed = !shallowEqual(lastRest, rest);     // structurally always false
lastRest = { ...rest };                            // RIGHT — snapshot of the values
```

This shipped in `modules/animated/animated-props-runtime.ts` and cost most of a debugging session.
Effect: `reconcile` skipped forever after the first call, so each rebuilt `AnimatedInterpolation`
(a brand-new node on every `rebuild-interpolation`) never reached the native graph. The view stayed
wired to the FIRST interpolation, built before measurement with range `[-1,0,0,1] -> [0,0,0,1]` —
one pixel of travel, which on device reads as "the sticky header ignores scrolling entirely".

Why it hid for so long: on the JS-driven path a constant stream of passthrough ticks changed other
props, so `reconcile` re-ran anyway and eventually picked the new node up. Moving sticky headers to
the native driver removed that noise and exposed the dead comparison. **A skip that only works
because something else is churning is not working.**

Deep comparison is NOT the fix and would break it further: `rest.style` holds live `AnimatedNode`s
in a circular parent↔children graph (hence `describeTransform` instead of `JSON.stringify`), and
the signal being detected is *"this is a different node object"* — identity, not value equality.
Two interpolations with similar fields must count as a change.

Locked in by `modules/animated/animated-props-rest-proxy.test.ts`. Note `wantsNative: true` there
is load-bearing: the skip is gated on the leaf already being native, so a JS-only reconcile never
skips and would not reproduce the bug at all — an earlier version of that test passed against the
broken code for exactly this reason.

## §22. Directives, clsx `class`, and `{@attach}` — the element-vs-component split (2026-08-14)

Three gaps closed in one pass, all downstream of ONE fact worth stating on its own.

### 22a. The split itself, in the compiler's own words

App code here never authors a DOM element — it composes `<View>` / `<Text>` / … from
`@symbiote-native/svelte`. So the only question that matters for a Svelte language feature is
"is it legal on a COMPONENT?", and for the directive family Svelte answers that itself:

```
[component]
  FAIL  class: directive       This type of directive is not valid on components
  FAIL  style: directive       This type of directive is not valid on components
  FAIL  use: action            This type of directive is not valid on components
  FAIL  transition:            This type of directive is not valid on components
[element]
  ok    class: directive       set_class
  ok    style: directive       set_style
  ok    use: action            action
  ok    transition:            comment first_child if transition
```

(`node scripts/probe-svelte-language-surface.mjs`, svelte 5.56.8.) That is universal Svelte
behaviour, not something the shim causes and not something this adapter can fix. `class={expr}` /
`style={expr}` as ordinary PROPS work and always did.

`{@attach fn}` is the one member of that family that IS legal on a component — which makes it the
only route to the host node, and the reason 22c exists.

**Practical rule:** never file "directive X doesn't work on Symbiote components" as an adapter
bug, and never reach for a runtime workaround. Check the probe first; if it says FAIL under
`[component]`, the compiler rejected it and every Svelte app has the same constraint.

### 22b. clsx-shaped `class` — normalized at the bag boundary, NOT in `resolveClassName`

`class={{ active: isOn }}` and `class={['card', isOn && 'card-on']}` are idiomatic Svelte, but
Svelte only normalizes them on the ELEMENT path (`set_class` -> `clsx()` + `to_class()`,
`svelte/src/internal/shared/attributes.js`). A COMPONENT prop is handed over verbatim. So the
object form used to reach `routeProp` as an object and land in `resolveClassName`'s
"already a resolved style" branch — silently merged as inline style, painting nothing.

**Fixed in the ADAPTER, in `adapters/svelte/src/class-value.ts`, and deliberately NOT in the
engine.** `resolveClassName`'s object-means-resolved-style behaviour is load-bearing for the other
three adapters: React only ever passes a string, and Vue's own `normalizeClass` has already
flattened `:class` into a string before `patchProp` runs. Widening it would change their
behaviour for no gain.

**The disambiguation rule** (`{ color: 'red' }` is a style, `{ active: true }` is a class map —
only the VALUES tell them apart):

```
every own value is boolean / null / undefined  ->  clsx map, flattened to a class string
anything else, including an empty object       ->  resolved style, passed through untouched
```

Chosen because a style object's values are colours, lengths and numbers — never booleans — while
a clsx map is `{ name: <condition> }` and a condition idiomatically evaluates to a boolean. The
rule is also expressible as a TYPE (`IClassMap = Record<string, boolean | null | undefined>`), so
the one shape that would silently take the wrong branch — `{ card: someString }` — is a compile
error at the call site instead of a surprise on device. An empty object is deliberately not a
clsx map: both readings contribute nothing, so the non-allocating branch wins.

Flattening mirrors clsx's own `toVal` (strings/numbers contribute themselves, arrays recurse
dropping falsy entries, objects contribute truthy keys). If ANY part of the value is a resolved
style object, the whole value is handed on unchanged — so `class={['card', {color:'red'}]}` keeps
taking exactly the path it took before.

Two placement details that are not incidental:

- The normalization runs in `ShimElement`'s `set p` **before the bag is stored**, not at the
  `routeProp` call. The per-key diff then compares two class STRINGS instead of two
  freshly-allocated object literals, so re-rendering with an unchanged `class={{ active: isOn }}`
  stops marking the node dirty and stops driving a Fabric subtree clone that changes nothing.
- `resolveSvelteClass()` exists for the two components that resolve a class to a style THEMSELVES
  (ScrollView and VirtualizedList `splitLayoutProps` a class into layout vs. visual halves before
  they know which host tag gets which). They must not call the engine's `resolveClassName`
  directly, or a clsx map falls into the style branch again.

`IViewProps['class']` and its 17 twins are now `ISvelteClassValue`. Covered both ways in
`class-value.test.ts`, including a real compiled `View` mount asserting the resolved fields on the
committed node.

### 22c. `{@attach}` — and why identity-diffing the prop CANNOT work

`{@attach fn}` compiles to a prop whose key is a symbol from `createAttachmentKey()`, i.e.
`Symbol(ATTACHMENT_KEY)`; Svelte identifies one by `symbol.description === ATTACHMENT_KEY`
(`internal/client/dom/elements/attributes.js`). Both `rest_props` and `spread_props` expose symbol
keys through their `ownKeys` traps, so `Object.getOwnPropertySymbols()` over `$props()` — or over
the `...rest` object — finds them. `ATTACHMENT_KEY` itself is NOT publicly exported, so read the
description off a real `createAttachmentKey()` instead of hardcoding `'@attach'`.

**The trap, found by a smoke test failing on the swap case.** A DYNAMIC attachment expression does
not compile to a changing prop VALUE. The compiler emits a STABLE wrapper and moves the
reactivity inside it:

```svelte
{@attach which === 'first' ? first : second}
```
```js
[$.attachment()]: ($$node) => ($.get(which) === 'first' ? first : second)($$node)
```

So a hand-rolled "keep the previous fn, diff by identity, tear down on change" loop — which is
what the first implementation did — can NEVER see the swap: the read that changes lives in the
attachment BODY, and the prop value is the same function object forever. It passed the mount and
the `fromAction` tests and silently failed the one that swapped attachments.

**The fix is to delegate to Svelte's own `attach(node, getFn)`** (`svelte/internal/client`), which
is exactly the machinery for this: a managed effect around `getFn()` for the identity case, and a
branch effect around `fn(node)` so a reactive read in the body re-runs it with the previous
teardown fired first. `svelte/internal/client` ships no types — the one-function declaration lives
in `adapters/svelte/src/svelte-internal-client.d.ts` and belongs on §8's version-bump checklist.

Wiring, in `adapters/svelte/src/runes/attachments.ts` (a plain `.ts`, NOT a `.svelte.ts`: the
`$effect` stays at the component call site, because `.svelte.ts` is compiled by `compileModule` in
Metro but NOT by vitest, which has no Svelte plugin — a rune file imported by every component
would break every smoke test in this package):

```svelte
const syncAttachments = createAttachmentsSync();
$effect(() => { syncAttachments(hostShim, rest); });
```

That effect depends ONLY on the host ref (the attachment values are read lazily inside `attach`'s
own effects, never in the caller's body), so it re-runs only when the host node itself changes,
and Svelte then destroys the previous run's child effects — firing every teardown — before
attaching to the new node.

**Coverage is complete, and split into three shapes rather than one:**

1. **Own host root, wired directly** (`$state.raw` + `bind:this`, per §15's identity rule):
   View, Text, SafeAreaView, RefreshControl, Image, ImageBackground, InputAccessoryView,
   KeyboardAvoidingView (both layout branches), Modal, ActivityIndicator, Switch, TextInput,
   Pressable, ScrollView, VirtualizedList, Animated.View / .Text / .Image.
2. **Free, no code at all** — a component that only re-spreads `...rest` onto another Symbiote
   component: TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback,
   TouchableNativeFeedback, Button. Symbol keys survive a component spread
   (`spread_props`' `ownKeys` walks `Object.getOwnPropertySymbols`). Proven end to end by
   `attachments.smoke.test.ts`'s TouchableOpacity -> Pressable case, not assumed.
3. **Explicitly forwarded with `pickAttachmentProps`** — a component that rebuilds its child's
   props BY NAME, or through a string-keyed `Record`, both of which drop symbol keys silently:
   FlatList, SectionList, VirtualizedSectionList (~30 named props each), Animated.ScrollView
   (`reduceProps` returns a plain Record), ScrollViewStickyHeader (had no rest binding at all
   until this pass).

**If you add a component, decide which of the three it is.** Category 2 is the trap — it looks
like nothing needs doing because it works, and it stops working the moment someone converts the
spread into named props.

### 22d. `{@html}` fails LOUDLY now — and the preprocessor is renamed

`{@html}` compiles (emits `$.html`) and then paints nothing: it assigns an `innerHTML` the shim
does not define, or reaches `create_element('template')`, a tag with no `descriptorFor` entry.
There is no meaningful HTML to render into a native tree, so it is now rejected at build time.

`preprocessor/forbid-special-elements.ts` -> **`preprocessor/forbid-web-only-constructs.ts`**
(`forbidWebOnlyConstructs()`); `{@html}` is a template tag, not a special element, so the old name
no longer covered its own contents. The AST node type is `HtmlTag`, read off a real
`parse(source, { modern: true })` rather than guessed. The walk also had to grow: `{@html}` can
sit inside an `{#if}` / `{#each}` / snippet body, which hang off keys other than `fragment.nodes`,
so it now descends through every child value with a `seen` set instead of the one field the
`<svelte:*>` elements happened to live under. The error names the RN alternative
(`<View>`/`<Text>`), it does not just refuse.

Also exported as a `./preprocessor` subpath from `@symbiote-native/svelte`, closing the
follow-up `examples/svelte/svelte.config.js` records in its own comment (an app can now register
the same guard instead of duplicating it).

**CLOSED the same day (2026-08-14) — the guard now runs inside the Metro transformer too.**
It was briefly recorded here as an open gap, on the grounds that `svelte-check` and the language
server already run the same pass. That reasoning was left over from when the guard only covered
`<svelte:head|window|document|body>`, which are **inert** under the shim. `{@html}` is not inert —
it compiles and then silently paints nothing — and editor-time tooling only protects a developer
who has that tooling wired up. A consuming app whose own `svelte.config.js` never registers the
preprocessor would still have shipped the broken bundle, so the build-time gate is the only one
nobody can be missing.

`metro-svelte-transformer.cjs`'s `.svelte` branch now runs `markup()` BEFORE `compile()`, so the
author sees the real diagnosis rather than a downstream symptom. The preprocessor is reached by
**package self-reference** (`import('@symbiote-native/svelte/preprocessor')`), not a relative
path: `exports` and `publishConfig.exports` each map that subpath at their own target, so the one
line works both from `src/*.ts` in this workspace and from `build/*.js` in a published install.
Loaded lazily and memoized in a module-level promise — a `.cjs` file cannot `require()` an ESM/TS
module, but `transform` is already `async`. Covered by three tests in
`metro-svelte-transformer.test.ts` (ordinary component passes, `{@html}` and `<svelte:head>`
reject).

The probe script also prints a `preprocessor verdict` section alongside the compiler verdict, so
"ok" under `[control flow]` is never mistaken for "supported" — `compile()` does not invoke
preprocessors, and that distinction is exactly what made this gap easy to miss.


## A CAPITALIZED native Fabric tag: `<svelte:element>` + `{@attach}`, not the Descriptor bridge (2026-08-14)

Found while porting `packages/navigation` to Svelte, whose whole surface is
react-native-screens views: `RNSScreen`, `RNSScreenStack`,
`RNSScreenStackHeaderConfig`, `RNSScreenContentWrapper`, `RNSSearchBar`. All
capitalized and un-hyphenated, so a literal `<RNSScreen>` in a template parses as a
COMPONENT reference — the same wall `@symbiote-native/slider`'s `RNCSlider` hit.

Slider's answer (mount the leaf through `mountDescriptorChildren`) does not
generalize: it works only because that leaf carries no live framework children. A
stack screen does — the app's own screen component lives inside
`RNSScreenContentWrapper` — and a Descriptor cannot carry a live component.

**What actually works, measured against the real compiler + the real shim:**

```svelte
<svelte:element this={'RNSScreen'} {@attach hostProps(plan.screenProps)}>
  …ordinary framework children…
</svelte:element>
```

with

```ts
export function hostProps(props: Record<string, unknown>): (node: unknown) => void {
  return node => { if (isShimElement(node)) node.p = props; };
}
```

- `<svelte:element>` creates the element via `document.createElement(tag)` with a
  plain runtime string the compiler never inspects, and it accepts children.
- §15's warning still stands and is why the attachment exists: a dynamic tag compiles
  through Svelte's generic `setAttribute` codegen, so `p={bag}` **as an attribute**
  silently fails. An attachment is handed the raw element and assigns the property
  from JS, then re-runs on every change of what it read — the shim's own `p` setter
  does the per-key diff from there. `bind:this` + `$effect` works identically; the
  attachment is just terser and needs no `$state.raw` ref per tag.
- **§4's table lists `svelte:element` under "dead if we forbid the feature". That is
  now wrong in practice** — the shim already covers everything
  `dom/blocks/svelte-element.js` needs, verified by
  `packages/navigation/src/svelte/stack/stack.smoke.test.ts` committing a real
  `RNSScreenStack > RNSScreen > [RNSScreenStackHeaderConfig,
  RNSScreenContentWrapper]` tree. Do not forbid it; it is the ONLY route to a
  capitalized native tag with live children.

## Rendering declarative marker children Svelte cannot introspect (2026-08-14)

React reads `children` as an array, Vue scans the default slot's vnodes, Angular
queries `@ContentChildren`. Svelte hands a component an opaque `Snippet` — there is no
`<Stack.Screen>` scan. Registration inverts instead: the navigator publishes a
collector on the context, each marker registers ITSELF during its own init, and the
route list derives from what came back.

Three things this depends on, all verified before being built on rather than assumed:

1. **Context follows the RUNTIME render tree, not the lexical definition site.** A
   component instantiated inside a snippet the APP passed down still sees the
   `setContext` the navigator set. Without this the whole scheme is impossible.
2. **The initial render is synchronous and top-down**, so a navigator that renders the
   children snippet BEFORE the `{#each}` painting its routes has a fully populated
   registry by the time the route list is first read — no extra frame, no seeding
   effect.
3. **`Object.assign(CompiledComponent, { Screen })` + `<Stack.Screen />` works** —
   Svelte resolves member-expression component tags, and a compiled component is an
   ordinary function object.

**Where the markers are rendered is a correctness decision, not a layout one.**
Naturally formatted markup puts each `<Stack.Screen>` on its own line, which is exactly
§16's stray-single-space case, and the resulting `RCTRawText` would land inside
whatever host tag holds the `{@render children?.()}` — illegal inside a plain
`symbiote-view`, and worse inside `RNSScreenStack`, whose native side expects only
RNSScreen children. So every navigator renders the snippet inside a collapsed
`symbiote-text` (`packages/navigation/src/svelte/registry-host.ts`,
`{position:'absolute',width:0,height:0,opacity:0}`): raw text inside an RCTText is
LEGAL, which turns a device crash into a no-op and makes the hazard structurally
impossible instead of a rule app authors must remember. Cost is one collapsed,
non-interactive RCTText per navigator. `stack.smoke.test.ts` asserts the exact
committed outline including that node, so the arrangement cannot silently drift.

---

## §24. Five authoring traps (2026-08-14) — three found porting `examples/svelte`'s navigation suite, two adding its style-block demo

They share a shape worth naming on its own: **the symptom points somewhere other than the
cause.** None is discoverable by reading the code that breaks.

### 24a. `svelte-check` reports a preprocessor throw as a WARNING, not an error

`--threshold error` therefore does NOT fail on `{@html}`, even with `forbidWebOnlyConstructs()`
registered in `svelte.config.js`. Verified live: a probe file containing `{@html}` makes
`svelte-check` report a problem, and removing it returns to clean — but the run still exits as if
nothing were wrong under the error threshold.

**Consequence: the editor-time gate is advisory; the Metro transformer is the only hard gate.**
That is now true by construction (§22d — `metro-svelte-transformer.cjs` runs `markup()` before
`compile()`), and this is the reason it had to be. Do not "simplify" by relying on the
preprocessor registration in `svelte.config.js` alone — a CI step running `svelte-check
--threshold error` would pass a build the bundler rejects.

### 24b. A local named `state` silently breaks every `$state()` rune in the same file

`svelte2tsx` reads `$state(...)` as a **store subscription on a variable named `state`** when one
is in scope, and fails with a store-related error that never mentions runes. Cost real debugging
time in `StatePersistenceScreen.svelte`, which now names its local `navigatorState`.

Generalize it: `$`-prefixed identifiers are store syntax in Svelte, so any local whose name
collides with the part after `$` in a rune call can capture it. **Do not name a local `state`,
`derived`, `effect`, `props`, or `inspect` in a `.svelte` file.**

### 24c. `bind:this` on a package-shipped `.svelte` component has NO usable type

A `.svelte` file imported from `node_modules` resolves through Svelte's ambient
`declare module '*.svelte'` fallback, i.e. a bare `SvelteComponent<Record<string, any>, any, any>`.
The `export function push/pop/replace/reset/…` surface that `bind:this` actually returns at
runtime is erased, so annotating the binding as `INavigatorHandle | null` fails with
*"Type 'SvelteComponent<…>' is missing the following properties … push, pop, popToTop, popTo, and
4 more."*

This affects EVERY package that ships raw `.svelte` sources — currently `@symbiote-native/
navigation` and `@symbiote-native/slider` — and it is the type-level twin of §13's already-recorded
packaging problem (`tsc` never touches `.svelte`, so `scripts/copy-svelte-sources.mjs` copies the
sources but nothing generates their declarations).

Current workaround, used by `examples/svelte/App.svelte` and by the package's own
`stack.smoke.test.ts`: hold the binding as `unknown` and narrow with a runtime guard. **The real
fix is generating `.svelte.d.ts` alongside the copied sources** (`svelte2tsx` can emit them) —
not yet done, and it is the one thing standing between a consumer and a typed navigator handle.

### 24d. A literal `<style>` / `<script>` tag inside a JS COMMENT breaks `svelte-check`, not the compiler

Found 2026-08-14 writing `examples/svelte/components/CompoundClassDemo.svelte`, whose script-block
doc comment opened with "A component-local `<style>` block, and specifically…". `svelte-check`
reported, at the position of the file's REAL closing `</style>` twenty lines further down:

```
ERROR components/CompoundClassDemo.svelte 63:9 "`<script>` was left open"
      https://svelte.dev/e/element_unclosed
screens/CanaryScreen.svelte 78:10 "Module '.../CompoundClassDemo.svelte' has no default export."
```

Both errors are downstream noise: the second is only "the first file failed to compile". And the
first is a lie — `svelte/compiler`'s own `parse()` AND `compile()` accept the file without
complaint (checked directly on the exact bytes). The trap is that `svelte-check` splits a
component into its script / markup / style blocks with its own textual scan BEFORE the real
parser runs, and that scan does not know it is inside a JS comment: the `<style>` on line 2 ends
the `<script>` block as far as the splitter is concerned, so the script never closes.

**Rule: never write a literal `<style>`, `<script>` or `</…>` tag inside a comment in a `.svelte`
file** — in the script block or in a markup comment. Say "style block" in prose. Escaping it as
`&lt;style&gt;` inside markup text is fine (that is real text, not a tag) and is what the demo's
own on-screen label does.

Diagnostic tell: `svelte-check` errors that `svelte/compiler` cannot reproduce. Reach for a direct
`parse()` on the file before believing the diagnostic — three of the four minutes spent here went
into a wrong theory about the preprocessor's missing sourcemap.

### 24e. A consuming app's `svelte.config.js` must register `scopedStyles()`, not only the guard

`examples/svelte/svelte.config.js` listed only `forbidWebOnlyConstructs()`. The app still RENDERED
correctly — `metro-svelte-transformer.cjs` calls both preprocessors itself, so the bundle is right
either way — but every rule in a component's style block came back as a `css_unused_selector`
warning in `svelte-check` and in the editor, because without `scopedStyles()` the tooling sees the
raw block and applies Svelte's own scoping, which deliberately refuses to reach into a child
component (and in this project a component renders only other components). Registering it dropped
`examples/svelte` from 3 warnings to 0.

So the reference consumer config is BOTH:

```js
preprocess: [forbidWebOnlyConstructs(), scopedStyles()],
```

Order matters for the same reason `adapters/svelte/svelte.config.js` states: the guard throws on a
construct that cannot work at all, so it runs before anything rewrites the source it reports
offsets against.

## §25. `svelte/reactivity/window` and `MediaQuery` — the RN twins, and what got no twin (2026-08-14)

`svelte/reactivity` is mostly portable, so the gap is narrow and worth stating precisely rather
than re-grepping. Measured against `svelte/src`:

| subpackage | verdict |
|---|---|
| `svelte/reactivity` — `map` / `set` / `date` / `url` / `url-search-params` / `create-subscriber` | PURE, work as-is. Do not wrap them. |
| `svelte/reactivity` — `media-query.js` | browser-only: `window.matchMedia` |
| `svelte/reactivity/window` | browser-only: `innerWidth` `innerHeight` `outerWidth` `outerHeight` `scrollX` `scrollY` `screenLeft` `screenTop` `devicePixelRatio` `navigator.onLine` |
| `svelte/motion` | no browser API. `Tween`/`Spring` use `raf` from `internal/client/timing.js`, which resolves to a real `requestAnimationFrame` under the `browser` export condition Metro already sets. Runs on the JS thread. |
| `svelte/store`, `svelte/easing`, `svelte/attachments`, `svelte/events` | PURE |

The dom-shim patches only the DOM *classes* compiled Svelte output touches — never the browser's
window-metric properties — so every browser-only value above reads `undefined` forever and never
updates. Silent, not a crash.

### The twins (`adapters/svelte/src/runes/`, exported from the package barrel)

| Svelte browser value | RN twin | source |
|---|---|---|
| `innerWidth` / `innerHeight` | `innerWidth` / `innerHeight` | `Dimensions.get('window')` |
| `outerWidth` / `outerHeight` | `outerWidth` / `outerHeight` | `Dimensions.get('screen')` |
| `devicePixelRatio` | `devicePixelRatio` | `PixelRatio.get()` |
| `new MediaQuery('orientation: …')` | `orientation` → `'portrait' \| 'landscape'` | `Dimensions.get('window')`, `height >= width` is portrait |
| `new MediaQuery('min-width: 800px')` | `createWidthQuery({ minWidth, maxWidth })` → `boolean` | `Dimensions.get('window').width`, both bounds inclusive, in dp |
| `new MediaQuery('prefers-color-scheme: dark')` | the EXISTING `useColorScheme()` rune | `Appearance` |
| `online` | `useNetworkState()` from `@symbiote-native/network/svelte` | expo-network |
| `scrollX` / `scrollY` / `screenLeft` / `screenTop` | **none — deliberately absent** | — |

Files: `runes/dimensions-value.ts` (the one `createSubscriber` ↔ `Dimensions` bridge),
`runes/window.ts`, `runes/media-query.ts`, plus `window.test.ts` / `media-query.test.ts`.

### Why `createSubscriber` and not `$state` + `$effect`

These are module-level **singletons**, not `useX()` calls, and that is only possible because
`createSubscriber` (pure, no DOM in its implementation — it is the integration point Svelte's own
`MediaQuery` is built on) does the bookkeeping:

- `start` runs lazily on the FIRST reactive read and the teardown when the LAST reading effect is
  destroyed. Importing the barrel attaches no `Dimensions` listener; N components reading
  `innerWidth.current` share one; a re-read on every effect re-run does not climb the count
  (asserted in `window.test.ts`).
- `.current` is legal OUTSIDE a component (it reads through, untracked). `$effect` throws
  `effect_orphan` anywhere but a component — which is why the older `useWindowDimensions()` /
  `useColorScheme()` runes in the same bucket are component-only and these are not.
- The teardown is a microtask AFTER unmount (`queue_micro_task` in `create-subscriber.js`), so a
  test must `await` a tick before asserting `remove()`.

These three files are plain `.ts`, NOT `.svelte.ts`: they contain no rune syntax, so
`compileSvelteModuleFile` has nothing to do (same as `runes/attachments.ts`). `.svelte.ts` is for
files that literally write `$state`/`$effect`.

Two deliberate divergences from upstream, both improvements: the type is `number`, not
`number | undefined` (upstream's `undefined` is its SSR branch; there is no SSR here and
`Dimensions` always answers, falling back to zero metrics when `DeviceInfo` is unresolvable), and
`outerWidth`/`outerHeight` mean the physical screen rather than a browser window inside a desktop
window manager.

### Decision — `scrollX` / `scrollY` / `screenLeft` / `screenTop` are OMITTED, not throwing stubs

Considered exporting a binding that throws with a message naming the alternative. Rejected:

- An absent export already fails honestly, and fails EARLIER: `tsc` errors, Metro fails to
  resolve, the author sees it before the app runs, on every platform, at zero runtime cost. A
  throwing stub only fires on device, on the line that finally reads it, and invites a `try`.
- There is no alternative to name. RN has no window-level scroll offset — scroll position is
  per-`ScrollView` via its own `onScroll`/`Animated.event` — and an app has no position inside a
  desktop window manager, so `screenLeft`/`screenTop` describe a concept that does not exist. A
  throw would have to say "there is no equivalent", which the compile error says first.

Open follow-up, owned by whoever holds `preprocessor/forbid-web-only-constructs.ts`: that guard
already throws on `<svelte:window>` with RN advice. An `import … from 'svelte/reactivity/window'`
(or `MediaQuery` from `svelte/reactivity`) in app source is the same class of mistake and would be
caught in the same place, pointing at the twins above. Not implemented.

### Decision — no `MediaQuery`-shaped class

A faithful-looking `new MediaQuery('…')` would take an arbitrary CSS media-query STRING. The CSS
media-query grammar has dozens of features; RN can honestly answer three or four. Every other one
(`hover`, `pointer`, `prefers-reduced-motion`, `print`, `color-gamut`, `aspect-ratio`) comes back
`false`, which is indistinguishable from a legitimate "no" — the exact "works by accident"
dependency `symbiote-web-lib-portability-check` says to reject, except self-inflicted. The failure
would be silent, on device, in a value the author already believes.

Named exports invert that: an unsupported feature is not a `false`, it is a name that does not
exist — a compile error at the import. Cost is that a migrating app rewrites its query strings
into three named calls; that rewrite is the point, because it is where the unanswerable features
surface.

### Decision — `online` stays in `@symbiote-native/network`, NOT in this adapter

`navigator.onLine`'s twin is `useNetworkState()`, and it already ships from
`@symbiote-native/network/svelte` (`packages/network/src/svelte/runes/use-network-state.svelte.ts`).
Three reasons not to move or mirror it here:

1. **It would be a dependency CYCLE.** `packages/network/package.json` peer-depends on
   `@symbiote-native/svelte` (as it does on every adapter). The adapter depending back on the
   package closes the loop.
2. **`<runtime_modules_layering>`.** The adapter re-exports pure engine modules and thin native-
   bridge modules the engine already carries (`getNativeModule` + device events). `network` is an
   `expo-modules-core` wrapper needing autolinking — making it a dependency of the adapter forces a
   native module on every Svelte app that imports a `View`.
3. **The package's answer is strictly richer.** `NetworkState` carries `isConnected`,
   `isInternetReachable` and the connection `type`; `navigator.onLine` is one boolean, and the one
   it reports is closest to `isConnected`.

Same rule for any future browser-global twin whose RN source lives in a `packages/*` wrapper: the
twin belongs in that package's own `src/svelte/` entry, never in the adapter.

---

## `{#await}` and `<svelte:boundary>` — first real execution, and the offscreen-move bug it found (2026-08-14)

Both constructs were compile-verified only: the preprocessor allows them, `tsc --build` sees
nothing, and nothing in the repo had ever run `$.await_block` or `$.boundary`. Three new smoke
files close that, all on §15's harness (compile real Svelte source to a uniquely-named file under
`build/`, dynamic-import it, assert the committed Fabric tree — never `toBeDefined()`, always the
exact child list, because a stray anchor or a leftover branch is precisely what these constructs
produce when they break):

- `adapters/svelte/src/await-block.smoke.test.ts` — pending→then with a promise resolved AFTER
  mount, pending→catch, the `{#await expr then value}` short form, a promise swapped for a new one
  while the first is still pending, and `{#await}` nested in a keyed `{#each}` resolving out of
  order.
- `adapters/svelte/src/boundary.smoke.test.ts` — transparent render, a child component throwing
  during init (`failed` snippet + `onerror`), `reset()` travelling out of the `failed` snippet, and
  a boundary wrapping a real `{#each}` across a reorder+grow+shrink.
- `adapters/svelte/src/async-blocks.smoke.test.ts` — the same two constructs compiled with
  `experimental: { async: true }`.

### Why the async-mode file has to exist separately

`should_defer_append()` (`dom/operations.js:227`) returns `false` unless `async_mode_flag` is set,
so `BranchManager`'s offscreen branch and `<svelte:boundary>`'s `pending` snippet — i.e. the
`document.createDocumentFragment()` calls at `dom/blocks/boundary.js:272/305` and
`dom/blocks/branches.js:142/192` — are UNREACHABLE with this repo's own `svelte.config.js` options.
The flag is turned on by a module side effect the compiler injects
(`import 'svelte/internal/flags/async'`) and there is no supported way back within a process, so
those cases need their own file; vitest isolates each test file's module registry, and the full run
confirms no leakage.

### The bug: `detachFromParent` never unlinked the ENGINE node

`shim-node.ts`'s module-level `detachFromParent()` removed a node from its shim parent's `children`
array and nulled `parent`, but left the `ISymbioteNode` attached to the old engine parent. It went
unnoticed because the common path hides it: `insertOne` immediately calls
`engineAppendChild(newParent, …)`, and the engine's own `appendChild`/`insertBefore`
(`core/engine/src/node.ts:277/283`) start with a `detach(child)` — so a live→live move self-heals.

It does NOT self-heal when the new parent has no engine node of its own. That is exactly a live node
appended into an offscreen `DocumentFragment`: `insertOne`'s whole engine half is skipped, so
nothing ever unlinks the old attachment and **Fabric keeps painting a subtree Svelte believes is
offscreen**. Real DOM's `fragment.append(liveNode)` takes the node out of the document; the shim's
did not.

Svelte does that move in three places — all of them the deferred machinery §17 already burned us
in: `dom/blocks/branches.js:142` (an onscreen branch parked for a later batch),
`dom/blocks/each.js:156` (`destroy_effects` preserving an item a pending batch still needs), and
`dom/blocks/boundary.js:306` (`move_effect` of the main effect while a `pending` snippet shows).

**Fix**: `detachFromParent()` now calls `engineRemoveChild(parentEngineNode, engineNode)` and
`parent.surface?.requestCommit()` when both node and parent are live. The commit request is not
optional — when the destination is a fragment, nothing downstream asks for one, so without it the
removal would sit uncommitted.

**Pinned by** `adapters/svelte/src/dom-shim/offscreen-fragment.test.ts`, driven against the shim API
directly rather than through a compiled component: the Svelte-side trigger needs a specific
multi-batch race, while the contract is one line of the DOM spec and is worth its own regression.
Its second test covers the live→live reorder, so the extra unlink can never turn a keyed `{#each}`
reorder into a drop.

**Generalize this.** Same class as §17 and §11c: every one of these was the shim quietly diverging
from a DOM rule in the offscreen/anchor machinery, and every one was invisible to `tsc`, to
`svelte-check`, and to any assertion weaker than an exact committed-child list. When touching
`shim-node.ts`, ask what the real DOM does with a node that is already in the document — not just
what makes the current test pass.

### A harness note worth reusing: `{@const}` in a snippet is LAZY

Capturing a snippet parameter (e.g. `<svelte:boundary>`'s `reset`) with
`{#snippet failed(error, reset)}{@const captured = capture(reset)}…` does not work: `{@const}`
compiles to `$.derived(…)`, and a derived nothing reads is never evaluated, so the capture silently
never runs (the first `reset()` test failed exactly this way). Route it through a prop-bag
expression instead — `<symbiote-view p={makeBag(reset)}>` — which `set_custom_element_data` always
consumes. Note also that snippet parameters arrive as thunks in the compiled output, so the
generated code reads `reset()`, not `reset`.

---

## §25. A `.svelte` `<style>` block — IMPLEMENTED (2026-08-14) at PREPROCESS time, because Svelte's own CSS output is structurally empty here

Scoped `<style>` is Svelte's default styling idiom and it produced nothing at all before this.
The fix is `adapters/svelte/src/preprocessor/scoped-styles.ts` plus its runtime half
`adapters/svelte/src/style-scope.ts`; read those two files' headers for the code-level detail.
This section records WHY the obvious implementation is impossible and what the chosen one costs.

### 25a. Consuming `result.css` cannot work — measured, not assumed

Compiled with this adapter's own options (`generate:'client', fragments:'tree', css:'external'`):

```
<symbiote-view class="card">   result.css: .card.svelte-4psua6 { padding: 12px }
                               result.js:  $.set_class(symbiote_view, 1, 'card svelte-4psua6')

<View class="card">            warnings:   css_unused_selector  (one per selector)
                               result.css: /* (unused) .card { padding: 12px }*/
                               result.js:  class: 'card'      <- plain prop, no scope suffix
```

The first row is dead twice over: `set_class` writes `dom.className`, which `ShimElement` does not
implement, and app code never authors a host tag anyway (§22a). The second row is 100% of real app
code — and Svelte deliberately refuses to scope a parent's styles into a child COMPONENT, so
**every selector is commented out before `result.css` exists.** There is nothing left to register.
This is normal Svelte semantics, not a shim bug, and no compiler option changes it. Do not re-open
this as "just wire up `result.css`".

### 25b. The chosen shape: scope in a PREPROCESSOR, before `compile()` ever sees the block

Same four moves Vue's `<style scoped>` already makes (`symbiote-sfc-style-compiler` §5), moved
from a compiler node-transform to a source rewrite because Svelte's compiler exposes **no AST
hook** — a `markup()` preprocessor returning rewritten text is the only seam.

1. Parse the block out; compile it through `@symbiote-native/css-parser`; register every class
   under a per-file-suffixed key `card` -> `card__svelte-<hash>` in the same flat global registry
   `App.css` and Vue SFC blocks already populate.
2. Rewrite `class` in this file's own markup to name the suffixed key.
3. Delete the `<style>` block from the source handed on — so Svelte emits no
   `css_unused_selector` and adds no scope hash of its own.
4. Append ONE `<script module>` line with the `registerStyles()` call and the two per-file
   constants step 2 refers to.

Wired in BOTH places, for the same reason `forbid-web-only-constructs` is: `svelte.config.js`
`preprocess` (svelte-check / language server) and `metro-svelte-transformer.cjs` (a consuming app
whose own config never registers it). The transformer now USES the returned `code` — unlike the
guard, which only throws.

### 25c. The four design decisions, and why

**Scoped-name shape: a single suffixed key (`card__svelte-<hash>`), not the compound
`.card.svelte-<hash>`.** The registry's `tryCompoundLookup` would have made the compound form
work, but it costs a permutation walk over 2-4 tokens on every resolve, and the suffixed form is
one exact `Map` hit — and is byte-for-byte the convention Vue's `<style scoped>` already uses, so
the two adapters share one mental model and one registry key space. Prefix is `svelte-` (mirroring
Svelte's own `.svelte-hash`) rather than Vue's `data-v-`, so a mixed app cannot collide.

**Static vs dynamic `class` split.** A static `class="card"` is resolved at build time — the
tokens are all visible, so no runtime call is emitted at all. Anything with an expression
(`class={cond ? 'lit' : 'dim'}`, `class={['a', b && 'c']}`, the clsx object form, or an
interpolated `class="card {extra}"`) is wrapped in `scopeSvelteClass(expr, names, id)`. An
interpolated value is rebuilt as the template literal Svelte itself would have concatenated, so
both shapes reduce to ONE expression. `scopeSvelteClass` normalizes through the adapter's own clsx
boundary (`normalizeSvelteClass`, §22b) FIRST and scopes only what comes back as a string —
which is why it does not reuse the engine's `scopeClassName`: that one takes Vue's narrower input
surface and `.split()`s a literal `false` out of `['card', cond && 'on']`. Widening a function the
other three adapters depend on, to serve one adapter's syntax, is the same trade §22b already
refused for `resolveClassName`.

**Which markup gets the token — Svelte's file-locality rule, with ONE deliberate divergence.**
Only this file's own source text is ever rewritten, so a child component's markup is untouched:
that IS Svelte's rule and what a Svelte author expects. The divergence is at the component
boundary — on the web `<Child class="card"/>` does NOT apply the parent's `.card` (no hash lands
on the child's element); here it DOES, because the scoped NAME travels as an ordinary prop and
every Symbiote component forwards `class` to its host node. That is not an oversight: in this
project a component renders only other components, so the web rule would make every `<style>`
block a no-op — precisely the bug being fixed. The author-facing model still holds: "my `<style>`
styles the markup I wrote".

**`:global(.reset)`** registers unsuffixed and its markup token is left verbatim, via
css-parser's existing `globalClassNamesIn` — same escape hatch, same code, as Vue.

### 25d. Three implementation details that are not incidental

- **`src/scope-token.ts` must stay IMPORT-FREE, and the preprocessor reaches it by package
  self-reference (`@symbiote-native/svelte/scope-token`), never `../scope-token`.** Found the hard
  way, and invisible to every test in this package until one was written for it: `svelte.config.js`
  is loaded DIRECTLY by Node (svelte-check, the language server). Node strips the types off a
  `.ts` file but still runs its own ESM resolver over what that file imports, where an
  extensionless relative specifier is a hard `ERR_MODULE_NOT_FOUND` — so the whole preprocessor
  dies on load for every consuming app's editor tooling while vitest (which resolves through
  Vite, happy with extensionless) stays green. `src/style-scope.ts` cannot be the shared module
  for the same reason: it reaches `@symbiote-native/engine` through `class-value`, an entire
  extensionless graph. Hence the three-file split — `scope-token.ts` (the per-token rule, zero
  imports, shared by both halves so a static `class="card"` and a dynamic `class={'card'}` can
  never disagree), `style-scope.ts` (the clsx-aware runtime value scoper), `preprocessor/
  scoped-styles.ts` (build time). `scoped-styles.test.ts` spawns real Node against the real
  config as a regression guard.

- **Line numbers are preserved.** No source map is emitted (matching the sibling guard), so the
  rewrite is shaped to not need one: the `<style>` block is replaced by the same number of
  newlines it occupied, and the injected script is ONE line appended AFTER all original content
  (a trailing `<script module>` compiles fine and its consts are visible to the markup above it —
  verified against 5.56.8) or spliced onto an existing `<script module>`'s own opening-tag line.
  A `svelte-check` diagnostic still points at the right place. `lang="ts"` is mirrored onto an
  injected module script, since Svelte only strips types from a script it believes is TypeScript.
- **`adapters/svelte/tsconfig.json` gained a `core/css-parser` project reference.**
  `scoped-styles.ts` is the first TS (not `.cjs`) file in this package to import
  `@symbiote-native/css-parser`; without the reference `tsc` follows its `main` into that
  package's source and re-checks it under THIS project's options, which lack its
  `allowImportingTsExtensions` — 20+ spurious TS5097 errors. The reference redirects the import
  to the built `.d.ts`.

### 25e. What survives, and what does NOT — honest list

Everything here is a property of `@symbiote-native/css-parser` + the flat registry, shared with
Vue and Angular; none of it is Svelte-specific, and none of it was made worse by this feature.

| CSS feature | Result |
|---|---|
| plain declarations, `var()`, `calc()`, `rem` | work |
| `transform`, `box-shadow`, `filter`, `transform-origin`, `background-image` gradients | work (engine `STYLE_PROCESSORS`) |
| `:global(.x)` | works — registers unsuffixed |
| `.card-title` kebab authoring | works — matched against its camelCase registry key |
| `@media`, `@keyframes`/`animation`, `@supports` | **dropped**, one `console.warn` each — RN has no concept to target |
| `.card:hover` / any pseudo-class | **whole rule dropped** (`symbiote-sfc-style-compiler`'s pseudo-class bug) |
| `.card .title` descendant, `.card.big` compound | register under ONE merged key (`cardTitle`/`cardBig`) — so under scoping, markup writing `class="card big"` does NOT pick up `.card.big`; only the single-class rules resolve. Same on Vue; a pre-existing limit of the suffix scheme, not new here |
| `class:foo={cond}` directive | **not scoped** — it compiles to `set_class`, which the shim does not implement, so it is dead regardless (§22a: the directive is illegal on a component anyway) |
| `{...spread}` carrying a `class` key | **not scoped** — the preprocessor only sees literal `class` attributes |
| `<style lang="scss"/"sass"/"less"/"stylus">` | supported (delegates to css-parser's preprocessor layer), but **not covered by a test here**: the `svelte` vitest project sets `resolve.conditions: ['browser']`, and `sass`/`less`/`stylus` each declare a `browser` export first, resolving to browser bundles that fail under Node — the exact trap the vitest config comment already documents. Any other `lang` throws with a naming message rather than dropping the block |

### 25f. Verification actually run

`adapters/svelte/src/preprocessor/scoped-styles.test.ts` (16) covers the compiled TEXT — suffixing,
`:global`, kebab matching, the dynamic wrap, the interpolated template literal, the
existing-`<script module>` splice, line-number preservation, and a real `compile()` afterwards
asserting `warnings` has no `css_unused_selector` and `result.css` is `null`.

`adapters/svelte/src/components/scoped-styles.smoke.test.ts` (3) is the one that matters: real
`.svelte` source -> real preprocessor -> real `compile()` -> this adapter's `mount()` -> assertions
on the COMMITTED fake-Fabric node. It proves (a) a `<style>` block's declarations land on the
native node at all, (b) two components each defining their own `.card` do not bleed — asserted on
both committed trees, and (c) a dynamic clsx `class={['boxed', on && 'lit']}` resolves at runtime.
Full suite at the time of writing: 2150 passed / 402 files / 0 failed, `tsc --build` clean,
`node scripts/audit-svelte-stray-whitespace.mjs` 0 / 0.

## Publishing real types for the `.svelte` files we ship — BUILT 2026-08-14, closes §24c

`scripts/emit-svelte-declarations.mjs`, wired into the root `prepublish-build` right after
`copy-svelte-sources`, and into `adapters/svelte`'s own `prepack` beside it. The tool is
`svelte2tsx`'s `emitDts` — the same entry point `@sveltejs/package` (`svelte-package`) uses.
`svelte2tsx` is catalogued in `pnpm-workspace.yaml` next to `svelte` (it moves with it) and
installed as a root devDependency, since the script is a repo-level build step.

### There were TWO leaks, not one

`tsc` never reads a `.svelte` file, so every `.svelte` import inside a package resolves through
svelte's ambient `declare module '*.svelte'` (`svelte/types/index.d.ts` -> `const Comp:
LegacyComponentType`). That erasure escapes into the published tarball two different ways:

1. **The component modules.** Nothing sat next to `build/**/X.svelte`, so a consumer's own
   `import X from '@symbiote-native/pkg/build/.../X.svelte'` — and equally tsc's own
   `export { default as X } from './X.svelte'` re-export, which keeps the specifier verbatim in
   the emitted `.d.ts` — re-resolved through the same ambient wildcard on the consumer side.
   Fixed by emitting `X.svelte.d.ts` beside each copied source: TypeScript resolves a relative
   `./X.svelte` to `./X.svelte.d.ts`, and a concrete file always beats the wildcard.

2. **The `.ts` modules that launder a component through a VALUE — the one that actually caused
   §24c's symptom, and the one a naive "emit `.svelte.d.ts`" pass silently misses.** `Stack` is
   `Object.assign(StackImpl, { Screen })` in `packages/navigation/src/svelte/stack/index.ts`, so
   tsc *inlines* the type it saw at emit time straight into `build/svelte/stack/index.d.ts`:
   `LegacyComponentType & { Screen: LegacyComponentType }`. That text is frozen — adding
   `index.svelte.d.ts` afterwards does not change it, because nothing re-resolves it. Measured:
   7 such files repo-wide (`navigation` stack/tabs/drawer, `adapters/svelte`
   components/image, components/touchable-native-feedback, modules/animated, modules/status-bar).

### How the second leak is found and fixed

`LegacyComponentType` appears in **no** authored source anywhere under any package's `src/`
(verified by grep), so its presence in a `build/**/*.d.ts` is an exact, mechanical marker of
"tsc inlined the ambient fallback here". The script greps for it and replaces each hit with
**svelte2tsx's own declaration for the same module** — svelte2tsx's program resolved the
`.svelte` for real, so its `build/svelte/stack/index.d.ts` carries the full
`Component<IStackProps, { push; pop; popToTop; popTo; replace; setParams; reset; canGoBack }, "">`
plus a properly typed `Stack.Screen`. Only the `.d.ts` is taken; tsc's `.js` stays authoritative.

### Mechanics worth not re-deriving

- **Staging dir, not direct emit.** `emitDts` runs over the WHOLE package `src`, emitting a
  declaration for every `.ts` too. It writes into a throwaway `<pkg>/.svelte-dts/` (gitignored,
  removed in a `finally`) and only the wanted files are copied out, so tsc's output stays
  authoritative everywhere else.
- **Drive the component copy off the `.svelte` source list, never a `*.svelte.d.ts` glob.** A
  Svelte 5 rune module named `linking.svelte.ts` compiles to `linking.svelte.d.ts` as well — a
  glob would clobber tsc's version of it. `listSvelteFiles` is exported from
  `copy-svelte-sources.mjs` so both scripts agree on what "every `.svelte` source" means.
- **Ordering: AFTER `tsc --build`, because it PATCHES tsc's output.** The full chain is
  `typecheck -> fix-esm-extensions -> copy-svelte-sources -> emit-svelte-declarations -> ng:build`.
  `fix-esm-extensions` only walks `.js`, so it never sees these files; that is consistent with
  tsc's own `.d.ts`, which is likewise left extensionless (consumers resolve with Bundler/Metro
  semantics).
- **`svelte-shims-v4.d.ts`, not `svelte-shims.d.ts`** — svelte2tsx picks `SvelteComponent` over
  the deprecated `SvelteComponentTyped` off that FILENAME, not off a version probe.
- **A warm `tsc --build` reports `repaired: 0`, and that is correct.** tsc did not re-emit the 7
  files, so they still hold the previous run's repair. A cold build (delete the package
  `tsconfig.tsbuildinfo` — deleting `build/` alone is NOT enough, tsc trusts the buildinfo and
  skips) reports 7. The invariant is enforced by the final assertion, not by the counter.

### Failing loudly

`emitDts` does **not** throw when a component cannot be typed — it `console.warn`s a "likely not
generated" list and resolves, which would leave the consumer back on the ambient `any` this whole
mechanism exists to remove. All three signals are converted to a thrown error: the captured
warning, a copied `.svelte` with no declaration beside it, and any `LegacyComponentType` still
present in `build/` when the run ends.

### Proof (2026-08-14) — packed tarball, not reasoning

`pnpm run prepublish-build` -> `pnpm pack` in `packages/navigation` -> extract into a throwaway
consumer with only the tarball in `node_modules`, and run `svelte-check` (borrowed from
`examples/svelte/node_modules/.bin`, read-only) over:

```svelte
<script lang="ts">
  import { Stack } from '@symbiote-native/navigation/svelte';
  import type { INavigatorHandle } from '@symbiote-native/navigation/svelte';
  let navigator = $state<INavigatorHandle | null>(null);
  $effect(() => { navigator?.push('Details'); navigator?.popToTop(); navigator?.reset({ routes: [] }); });
</script>
<Stack bind:this={navigator}>{''}</Stack>
```

- WITH the generated declarations: `svelte-check found 0 errors and 0 warnings`. A deliberate
  `reset({ index: 0, routes: [] })` typo was rejected with *"'index' does not exist in type
  'Readonly<{ routes: readonly Readonly<{ key; name; params }>[] }>'"* — the argument shape is
  really checked, not merely `any`.
- With ONLY those files removed from the same extracted tarball: *"Type
  `SvelteComponent<Record<string, any>, any, any>` is missing the following properties from type
  'INavigatorHandle': push, pop, popToTop, popTo, and 4 more"* — §24c's exact error, reproduced
  and then removed.

The tarball carries a `.svelte.d.ts` beside all 8 of `navigation`'s `.svelte` files; 40 across the
three shipping packages (`adapters/svelte` 31, `navigation` 8, `slider` 1).

### Not covered

`adapters/svelte`'s `.svelte` files are still not type-CHECKED anywhere in this repo
(`svelte-check` lives only in `examples/svelte`). `emitDts` typing them for declaration emit is
not the same gate, and it surfaced none of the 19 known two-`svelte`-copies resolution errors —
its program resolves a single `svelte`, so those never arise here. `examples/svelte/App.svelte`
and `packages/navigation/src/svelte/stack/stack.smoke.test.ts` still hold their `bind:this` as
`unknown` behind a runtime guard: both compile against `src/`, where no `.svelte.d.ts` exists (the
declarations are a `build/`-only artifact, deliberately — writing generated files into `src/`
would put them in the repo's own tsc program, its eslint globs, and every other agent's
`git status`). Giving in-repo code real component types is a separate, larger decision.

## §26. Compound selectors in a `<style>` block — was dead, FIXED 2026-08-14

`.card.big { }` in a component's `<style>` block never applied. Not a Svelte
defect: Vue's `<style scoped>` had the identical bug from the identical cause,
and both were fixed together. The mechanism — a suffix appended per markup
TOKEN cannot be reconstructed from a key that carries the suffix once, at the
end — plus the two behavior changes that came with the fix (a compound rule
now layers over the single-class rules; a scoped token now layers over its own
global base) and the BEM trap in recognizing a scope suffix, are all recorded
in the `symbiote-sfc-style-compiler` skill, §5b. Read that before touching
`preprocessor/scoped-styles.ts`'s `localNames`, `core/css-parser`'s
`extractClassTokens` / `classTokensIn`, or the engine's compound lookup.
