---
name: svelte-adapter-dom-shim
description: "Symbiote Svelte adapter — the DOM-shim strategy and its exact hand-maintained surface. Read BEFORE writing any adapters/svelte/** code, before bumping the `svelte` dependency, and before debugging a Svelte-only render/event failure. Svelte's OFFICIAL custom-renderer API (sveltejs/svelte#18042, `createRenderer` from `svelte/renderer`) is still an UNMERGED PR, so the adapter instead patches globalThis DOM classes so stock compiled Svelte output runs unchanged — a deliberate, accepted coupling to Svelte PRIVATE internals, to be replaced by the official API once it ships. Holds: the measured mandatory DOM surface with file:line (init_operations' prototypes/descriptors/private fields; the 6 document factories; from_tree's build-once-then-clone; the universal `anchor.before()` mount path; createDocumentFragment in each/if/boundary); the CUSTOM-ELEMENT codegen path every hyphenated symbiote-* tag takes — importNode replaces cloneNode, and set_custom_element_data stringifies scalars and hard-excludes `style`, resolved by passing ONE object bag prop that lands as a property set and is unpacked into routeProp (which makes Svelte a flat-bag adapter, not a structural one, and collapses most of the event section); the dead-if-forbidden surface (svelte:head, element bind:, hydration, svelte:element, autofocus); why our camelCase onPress/onChangeText names DODGE Svelte's 23-name DELEGATED_EVENTS list and the lowercase-`onclick` trap that follows; the requirement that ISymbioteEvent be EXTENSIBLE and MUTABLE because handle_event_propagation writes a symbol and defines/deletes currentTarget on it; the measured React-Native 0.86 global collisions (installing `document` makes dev-menu React DevTools reconnects silently no-op via setUpReactDevTools' `!window.document` gate; navigator and requestAnimationFrame must NOT be patched; Node/Element/HTMLElement/Text collide with setUpDOM but with a narrow blast radius); and the lazy-engine-node design that avoids wolf-tui's third tree. NO web vocabulary belongs in the adapter — no div/span mapping, ever. Still OPEN: bootstrap/surface/multiple-roots, and how dev-warnings can detect a delegated event the shim never sees. Trigger on: 'svelte adapter', 'svelte support', DOM shim, patchGlobals, init_operations, from_tree, fragments:'tree', delegated events, bumping svelte, or issue #47."
---

# Symbiote Svelte adapter — the DOM-shim strategy

## §0. Status, provenance, and how to trust this file

**Status (2026-08-10): DECISION RECORDED, NOT YET IMPLEMENTED.** No
`adapters/svelte` exists, and `svelte` appears nowhere in `pnpm-workspace.yaml`.
This skill is the measured groundwork so implementation does not have to
rediscover any of it.

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
- **Referential stability matters.** Svelte re-applies the prop when the value
  changes. Build a **fresh** bag object per update rather than mutating one in
  place, or a mutation-in-place may be skipped as unchanged. (`RegularElement.js:673`
  notes `set_custom_element_data` "may not be idempotent", so do not rely on
  repeated identical application being free either.)
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
| `dom/blocks/svelte-element.js:95` | `<svelte:element>` dynamic tag |
| all of `dom/hydration.js` | hydration (never applicable) |

⚠️ **`dom/elements/events.js:122` (`document.body`) was previously listed here and
does not belong.** It is the delegation root, and delegation is **not** a feature
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

## §7. Dev warnings — mandatory, and the one that is genuinely hard

The shim's defining weakness is silent failure (§4). Every forbidden or
non-functional construct must be made loud at dev time:

| Construct | Detection |
| --- | --- |
| `bind:` on a Symbiote host element | build-time: a Svelte preprocessor / AST walk over the template |
| `transition:` / `animate:` / `in:` / `out:` | build-time: same walk |
| `<svelte:head\|window\|body\|document>` | build-time: same walk |
| lowercase delegated event name (`onclick`, `onchange`, …) | **see below — the hard one** |

### ⚠️ The `onclick` warning cannot be done from `addEventListener`

An earlier draft mandated this warning without saying how. The comprehension pass
caught that it appears self-defeating: §5c establishes that a delegated name never
reaches the shim's `addEventListener`, so the shim cannot observe it there.

**Two workable mechanisms, neither yet chosen:**

1. **Build-time (preferred, and it unifies the whole table).** A Svelte
   preprocessor walks the template AST and errors on any `on<lowercase>` attribute
   whose name is in `DELEGATED_EVENTS`, alongside the `bind:`/`transition:` checks.
   One mechanism covers every row.
2. **Runtime.** Svelte's delegation stores the handler as an expando on the element
   (`element[event_symbol][event_name]`, read at `events.js:264`). The shim could
   trap that assignment and warn. Workable, but it couples us to yet another
   private field — exactly the tax §8 is about.

**This is an OPEN decision.** Record the choice here when it is made.

---

## §8. What to re-check on EVERY `svelte` version bump

Ordered by fragility. None of this is public API.

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

## §10. OPEN: bootstrap

**Tag mapping is CLOSED (2026-08-10)** — see §3g. No web vocabulary in the
adapter; `descriptorFor` resolves `symbiote-*` intrinsics; an unknown tag errors
from the absence of a match. Do **not** adopt wolf-tui's blanket prefixing
(`wolfie-document.ts:161`: `tag.startsWith('wolfie-') ? tag : 'wolfie-' + tag`),
which would silently turn `div` into `symbiote-div`.

**Prop delivery is DECIDED (2026-08-10)** — the single object bag, §3g(c).

Still genuinely open, and the first thing an implementer must settle:

- What is the adapter's public entry point, and how is a `SymbioteSurface`
  obtained and handed to Svelte's `mount({ target })`?
- Can more than one Svelte root coexist, given that `patchGlobals()` is
  process-global? (Note the interaction with §6a: `document` must stay installed
  for a surface's lifetime, so "restore on unmount" is per-process, not
  per-surface.)
- What exactly happens on unmount beyond `restoreGlobals()`?
- The dev-warning mechanism — §7, still open.

Also still to design (covered by other skills, not here): the runes lifecycle layer
and the `descriptorToSvelte` bridge — see `symbiote-add-component`.

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
- **Everything in §10** — open by design.

---

## §14. Related skills and references

- `symbiote-new-adapter` — the generic "add an adapter" workflow.
- `symbiote-engine-core` — the mutation API the shim ultimately drives; note its
  comment at `node.ts:140-142` already names Svelte as a structural adapter.
- `symbiote-add-component` — the three-layer component split; Svelte's lifecycle
  layer will be runes (`$state`/`$derived`/`$effect`) plus a `descriptorToSvelte`
  bridge.
- `symbiote-web-lib-portability-check` — the project's position on web libraries
  that "work by accident"; directly relevant to §6e.
- `symbiote-dev-examples` — the Svelte canary belongs in `.examples/svelte`
  (workspace-linked dev harness), **never** in `examples/svelte` until published.
- `symbiote-dependency-catalog` — `svelte` must be added to the catalog in
  `pnpm-workspace.yaml`, never as a literal version in a package.
- GitHub issue **#47** in this repo — Svelte maintainer `benmccann` and
  custom-renderer author `paoloricciuti` offered help there; source of the original
  pointers and of the `@attach` recommendation.
- [sveltejs/svelte#18042](https://github.com/sveltejs/svelte/pull/18042) — the
  official API to migrate to once shipped.
