---
name: svelte-adapter-dom-shim
description: "Symbiote Svelte adapter — the DOM-shim strategy and its exact hand-maintained surface. Read BEFORE writing any adapters/svelte/** code, before bumping the `svelte` dependency, and before debugging a Svelte-only render/event failure. Svelte's OFFICIAL custom-renderer API (sveltejs/svelte#18042, `createRenderer` from `svelte/renderer`) is still an UNMERGED PR, so the adapter instead patches globalThis DOM classes so stock compiled Svelte output runs unchanged — a deliberate, accepted coupling to Svelte PRIVATE internals, to be replaced by the official API once it ships. Holds: the measured mandatory DOM surface with file:line (init_operations' 3 prototypes + 2 descriptors + 5 private fields; the 6 document factories; from_tree's cloneNode-per-instance; createDocumentFragment in each/if/boundary); the dead-if-forbidden surface (svelte:head, element bind:, hydration, svelte:element, autofocus); why our camelCase onPress/onChangeText event names DODGE Svelte's 23-name DELEGATED_EVENTS list and the lowercase-`onclick` trap that follows; the measured React-Native 0.86 global collisions (document is NOT defined by RN — only a Platform.OS==='web' branch; navigator and requestAnimationFrame must NOT be patched; Node/Element/HTMLElement/Text DO collide with RN's setUpDOM and why the blast radius is narrow); the module-load-order requirement from constants.js's IS_XHTML; and the lazy-engine-node design that avoids wolf-tui's third tree. Trigger on: 'svelte adapter', 'svelte support', DOM shim, patchGlobals, init_operations, from_tree, fragments:'tree', delegated events, 'svelte renderer', bumping svelte, or issue #47."
---

# Symbiote Svelte adapter — the DOM-shim strategy

## §0. Status and what this document is

**Status (2026-08-10): DECISION RECORDED, NOT YET IMPLEMENTED.** No
`adapters/svelte` exists at the time of writing. This skill is the measured
groundwork so that implementation does not have to rediscover any of it.

**Measured against exact versions.** Every file:line below was read from real
source, not from memory or docs:

- `svelte` **5.56.8** (`sveltejs/svelte`, default branch)
- `react-native` **0.86.0** (tag `v0.86.0`, the version pinned in
  `pnpm-workspace.yaml`)

If either version has moved, **re-measure before trusting a line number** — §9
has the exact commands.

---

## §1. Background for a reader with zero context

### What problem this solves

SymbioteNative lets non-React UI frameworks drive React Native's native stack.
Each framework needs a **seam** — an official hook where the framework says
"here is how you create/insert/remove/update a node" and you supply your own
implementation instead of the browser DOM. We then map those calls onto
`@symbiote-native/engine`'s mutation API.

Every adapter so far had such a seam handed to it by the framework:

| Adapter | Official seam | Renderer size |
| --- | --- | --- |
| React | `react-reconciler` host config | — |
| Vue | `@vue/runtime-core`'s `createRenderer` | 154 lines (`adapters/vue/src/renderer/index.ts`) |
| Angular | `Renderer2` / `RendererFactory2` | 347 lines |

**Svelte, in its released versions, has no such seam.** Svelte compiles a
component straight into direct `document.createElement()` / `.appendChild()`
calls. There is no injection point.

### The two ways out

1. **The official custom-renderer API.** `createRenderer` from `svelte/renderer`,
   enabled by the `experimental.customRenderer` compiler option. Its shape is
   nearly identical to Vue's `RendererOptions`. It lives in
   [sveltejs/svelte#18042](https://github.com/sveltejs/svelte/pull/18042).
   **As of 2026-08-10 that PR is still OPEN** — opened March 2026, 158 commits,
   still awaiting an approving review, no release version, no announced date.
   (PR #18511 is a small follow-up in the same stack that forces the
   `custom-renderer` export condition for Node dual-modules; it is *not* the API
   itself.)
2. **A DOM shim.** Replace `globalThis.Node` / `Element` / `Text` / `Comment` /
   `DocumentFragment` / `document` with our own classes, so Svelte's compiled
   output calls *us* while believing it is calling the DOM. This needs no
   framework cooperation and works on stable, released Svelte **today**.

### Why the shim was chosen

Option 1 would mean pinning the whole adapter to an unmerged PR
(`pnpm add https://pkg.svelte.dev/svelte/c/<sha>`) with no timeline — an adapter
nobody can actually install. Option 2 ships against released Svelte.

**The accepted trade, stated explicitly by the project owner (2026-08-10):** the
shim couples us to Svelte's *private* internals, which carry no compatibility
guarantee. We accept that, maintain it by hand, and fix breakage honestly and
promptly when a Svelte release breaks a user. **When #18042 merges and ships, we
move to the official API.** This skill exists so that maintenance is a checklist
rather than an archaeology expedition.

### Prior art: wolf-tui

`wolf-tui` (the same author's terminal-UI project, the architectural ancestor of
SymbioteNative) already ships a Svelte package built exactly this way:
`packages/svelte/src/renderer/` — `wolfie-element.ts` (860 lines),
`wolfie-document.ts` (300), `wolfie-action.ts` (73), `init-layout-tree.ts` (38)
= **1271 lines**. Its README states the reason plainly: *"Svelte 5 has no custom
renderer API — this is the only way to intercept its DOM calls."*

**Read it for the shape, do not port it verbatim.** §7 and §8 record what must
change, and why roughly two-thirds of that line count does not apply here.

### An alternative that was raised and NOT decided

**Solid** has a stable, released, documented universal-renderer seam
(`createRenderer` from `solid-js/universal` — `createElement`, `createTextNode`,
`replaceText`, `setProperty`, `insertNode`, `removeNode`, `getParentNode`,
`isTextNode`), and `wolf-tui/packages/solid/renderer` is a ready twin. It would
need no shim and no dev pin. It was proposed as a way to ship a non-React
adapter with zero compromise while Svelte's API matures. **No decision was made
on Solid** — it is recorded here only so the option is not lost. Choosing Svelte
via the shim did not reject it.

---

## §2. How the shim works, mechanically

Svelte's client runtime calls `init_operations()` once, before any rendering. It
reads getters off `Node.prototype` / `Element.prototype` / `Text.prototype` via
`Object.getOwnPropertyDescriptor` in order to cache fast paths. That is the hook:
**if our classes ARE the globals at that moment, Svelte's whole node vocabulary
becomes ours.**

Hence the shim must use **real classes with real prototype getters** — not
`Proxy` objects, not plain object literals. `wolfie-element.ts` is built that way
for exactly this reason.

Two compiler options make this dramatically cheaper than it sounds:

- **`fragments: 'tree'`** (stable since Svelte **5.33**, added for CSP
  `require-trusted-types-for 'script'`). Makes the compiler emit `from_tree()`,
  which builds templates element-by-element via `document.createElement()`,
  instead of `from_html()`, which sets `innerHTML` on a `<template>`. **With this
  option we never need an HTML parser.** wolf-tui had to write one
  (`parseHTMLIntoFragment`, `wolfie-document.ts:81-128`) as a fallback — we do
  not. Set this option; it is not optional for us.
- **`css: 'external'`** — keeps Svelte from trying to inject `<style>` tags into
  a `document.head` that does not meaningfully exist. Styling goes through
  `@symbiote-native/css-parser` + the class registry, the same path Vue SFC
  `<style>` blocks already use.

`patchGlobals()` must be callable and reversible (`restoreGlobals()` on unmount),
mirroring `wolfie-document.ts`.

---

## §3. The MANDATORY DOM surface

Everything in this section is on the hot render path and **must** be implemented.
Paths are relative to `packages/svelte/src/internal/client/` in the Svelte repo.

### 3a. `init_operations()` — `dom/operations.js:38-75`

The single most private thing we depend on. It:

| What it does | Our obligation |
| --- | --- |
| `$window = window` | RN already sets `global.window = global` (`Libraries/Core/setUpGlobals.js:18-20`). **Nothing to do.** |
| `$document = document` | We must provide `document`. |
| `is_firefox = /Firefox/.test(navigator.userAgent)` | **Do NOT patch `navigator`.** See §5b — RN's `navigator` has no `userAgent`, `.test(undefined)` coerces to the string `"undefined"`, no match, `is_firefox === false`. Works untouched. |
| `Element.prototype`, `Node.prototype`, `Text.prototype` | Must be our classes. |
| `get_descriptor(Node.prototype,'firstChild').get` and the same for `'nextSibling'` | **These getters must live on `Node.prototype` itself**, not as own-properties of instances. Svelte extracts them ONCE and then calls `getter.call(node)` for nodes of *every* type — elements, text, comments, fragments. A per-subclass getter breaks this. |
| Writes `__e`, `CLASS_CACHE`, `ATTRIBUTES_CACHE`, `STYLE_CACHE` onto `Element.prototype`; `TEXT_CACHE` onto `Text.prototype` | Guarded by `is_extensible(...)`. Ordinary classes are extensible, so this just works — but our prototypes must not be frozen/sealed. |

`CLASS_CACHE` / `ATTRIBUTES_CACHE` / `STYLE_CACHE` / `TEXT_CACHE` are `Symbol`s
from `#client/constants`; `__e` is a plain string field. All five are internal
and undocumented.

### 3b. The six document factories

| Call | Source |
| --- | --- |
| `document.createTextNode(value)` | `dom/operations.js:82` |
| `document.createElement(tag)` / `createElement(tag, { is })` | `dom/operations.js:251` |
| `document.createElementNS(ns, tag)` / with `{ is }` | `dom/operations.js:255` |
| `document.createDocumentFragment()` | `dom/operations.js:260` |
| `document.createComment(data)` | `dom/operations.js:268` |
| `document.importNode(node, true)` | `dom/template.js:78,245` — reached only when the `TEMPLATE_USE_IMPORT_NODE` flag is set or `is_firefox`; `is_firefox` is `false` for us, but implement it anyway (one line delegating to `cloneNode`). |

### 3c. `from_tree` — `dom/template.js:171-259`

This is the template path under `fragments: 'tree'`. Read it carefully; it drives
most of the node-member requirements.

```js
function fragment_from_tree(structure, ns) {
  var fragment = create_fragment();
  for (var item of structure) {
    if (typeof item === 'string') { fragment.append(create_text(item)); continue; }
    if (item === undefined || item[0][0] === '/') {
      fragment.append(create_comment(item ? item[0].slice(3) : '')); continue;
    }
    const [name, attributes, ...children] = item;
    var element = create_element(name, namespace, attributes?.is);
    for (var key in attributes) set_attribute(element, key, attributes[key]);
    if (children.length > 0) {
      var target = element.nodeName === TEMPLATE_TAG ? element.content : element;
      target.append(fragment_from_tree(children, ...));
    }
    fragment.append(element);
  }
  return fragment;
}
```

Derived requirements:

- **`append(...nodes)` — variadic**, on both fragments and elements. Note this is
  `append`, not `appendChild`; both are needed (`appendChild` is used elsewhere).
- **`element.nodeName`** is read and compared against `TEMPLATE_TAG` and
  `'foreignObject'`. Must be present and stable.
- **`element.content`** — only when `nodeName` is `TEMPLATE`. We never emit
  `<template>`, so this branch is unreachable; leaving `content` undefined is
  fine.
- **`node.cloneNode(true)` — a deep clone, on EVERY instantiation.** This is the
  single most important structural fact in the whole file: `from_tree` builds the
  template graph **once** (guarded by `if (node === undefined)`), then clones it
  per component instance. See §8 — this drives the lazy-engine-node design.
- **`clone.lastChild`** (`template.js:250`) is read as an **ordinary property**,
  not through the cached descriptor. `firstChild` and `nextSibling` go through
  the cached `Node.prototype` descriptors; `lastChild` does not. Implement all
  three as prototype getters anyway.

### 3d. `createDocumentFragment` on the hot block paths

Not just templates — the core control-flow blocks allocate fragments per update:

| Source | Feature |
| --- | --- |
| `dom/blocks/each.js:160` | `{#each}` |
| `dom/blocks/branches.js:142,192` | `{#if}` / `{:else}` |
| `dom/blocks/boundary.js:272,305` | `<svelte:boundary>` |

A fragment must therefore be **cheap** and must correctly implement the DOM rule
that inserting a fragment inserts its *children*, leaving the fragment empty.

### 3e. `constants.js:80-83` — a module-load-time side effect

```js
export const IS_XHTML =
  !!globalThis.document?.contentType &&
  /* @__PURE__ */ globalThis.document.contentType.includes('xml');
```

Optional chaining means this cannot throw, and `IS_XHTML` resolves to `false`
either way. **But it runs at module evaluation time**, which imposes a hard
ordering rule:

> **`patchGlobals()` MUST run before the Svelte client runtime module is first
> imported.**

In a Metro bundle, module evaluation order follows import order. The adapter's
entry must therefore install globals before anything pulls in `svelte` /
`svelte/internal/client`. This is a real, easily-violated constraint — a
top-of-file `import App from './App.svelte'` in the wrong place is enough to
break it. Add a `dlog` at `patchGlobals()` so the ordering is observable.

### 3f. Events — `dom/elements/events.js`

- `element.addEventListener(name, wrapped, options)` / `removeEventListener`.
- `create_event` (`events.js:56+`) always wraps the user's handler and calls
  `handle_event_propagation.call(dom, event)` **even for non-delegated events**.
  That walk touches exactly two properties of the event object: **`event.target`**
  and **`event.cancelBubble`**. Our `ISymbioteEvent` must carry both, or the shim
  must decorate the event before handing it to Svelte.
- `events.js:76-79` defers attachment for `pointer*` / `touch*` / `wheel` (a
  Chrome `cloneNode` bug). Our event names never match those prefixes, so the
  branch is inert — but do not delete the equivalent if porting.

---

## §4. The surface that is DEAD if we forbid the feature

None of this needs implementing, **provided** the corresponding Svelte feature is
forbidden and that prohibition is enforced with a dev-time warning (§6).

| Source | Feature it belongs to |
| --- | --- |
| `dom/blocks/svelte-head.js:24,48` (`document.head`) | `<svelte:head>` |
| `dom/elements/bindings/document.js` (`document.activeElement`) | `bind:activeElement` |
| `dom/elements/bindings/navigator.js` (`navigator.onLine`) | `bind:online` |
| `dom/elements/bindings/input.js:89`, `select.js:123`, `universal.js:59,73` | `bind:` on **elements** |
| `dom/elements/misc.js:13,17,41` | `autofocus`, `document.addEventListener` |
| `dom/elements/attributes.js:645` (`document.baseURI`) | `src`/`srcset` URL comparison |
| `dom/elements/events.js:122` (`document.body`) | delegation root |
| `dom/blocks/svelte-element.js:95` | `<svelte:element>` dynamic tag |
| all of `dom/hydration.js` | hydration (never applicable) |

**Note the asymmetry against the official API.** When `experimental.customRenderer`
is set, the Svelte compiler *itself* rejects `bind:` on elements,
`transition:`/`animate:`/`in:`/`out:`, `svelte:window|body|document|head`,
`css: injected`, `createRawSnippet`, and hydration — at **compile time**. Under
the shim, all of those **compile successfully and then silently do nothing**
(e.g. `bind:value` attaches a listener for a DOM `input` event that Fabric never
fires; `transition:` consults a `getComputedStyle` stub that returns `{}`).

**Silent failure is the shim's single worst property.** The mitigation is
mandatory, not optional — see §6.

### Sanctioned workarounds for the forbidden features

- **`bind:` on elements** → expose bindable primitives as **components** with
  `$bindable()` props. (This is the same shape the official API forces, so the
  work is not throwaway.)
- **`transition:` / `animate:`** → document `@attach` instead. This is the Svelte
  maintainer's own recommendation in issue #47. Our `Animated` lives in
  `core/engine` and does not depend on Svelte at all.
- **`<svelte:window|body|document|head>`** → no meaning in RN; use the
  corresponding runtime module (`Dimensions`, `AppState`, `StatusBar`, …), all
  already in `core/engine` and re-exported per adapter.

---

## §5. React Native 0.86 global collisions — measured, not assumed

Patching globals inside RN is the risk everyone assumes is fatal. It was measured
against `react-native@0.86.0`. Most of it is fine; one item is real.

### 5a. `document` — RN does NOT define it ✅

The **only** reference to `document` in RN's entire JS tree is
`Libraries/Pressability/HoverState.js:19-25`, and it sits inside
`if (Platform.OS === 'web')`. Dead code on iOS and Android.

**Defining `globalThis.document` collides with nothing in RN core.** An earlier
assumption that it would make RN or libraries "think they are on the web" did not
survive measurement.

### 5b. `navigator` — do NOT patch ⚠️

`Libraries/Core/setUpNavigator.js:15-22` sets `global.navigator =
{product: 'ReactNative'}`, and if a `navigator` already exists it force-polyfills
`.product` to `'ReactNative'`. **`navigator.product === 'ReactNative'` is the
canonical way the JS ecosystem detects React Native** — clobbering it breaks
third-party detection silently.

wolf-tui's shim sets `navigator = { userAgent: 'wolfie' }` because
`init_operations()` reads `navigator.userAgent`. **We do not need to.** RN's
`navigator` exists but has no `userAgent`, so `/Firefox/.test(undefined)`
stringifies to `"undefined"`, does not match, and yields `is_firefox === false` —
exactly the value we want. **Leave `navigator` alone.**

### 5c. `requestAnimationFrame` — do NOT patch ⚠️

RN polyfills it lazily off `JSTimers` / a native frame source
(`Libraries/Core/setUpTimers.js:82-83`), synchronised to the display link.
wolf-tui replaces it with `setTimeout(cb, 16)`.

That would silently degrade **our own code**: `core/engine/src/animated/animations/raf.ts:16`
reads the global **at call time** via `Reflect.get(globalThis, 'requestAnimationFrame')`,
so every `@symbiote-native/engine` Animated driver would fall back to a 16 ms timer for
the entire time the shim is installed. RN's own Animated (Decay/Spring/Timing) too.
**Leave `requestAnimationFrame` and `cancelAnimationFrame` alone.**

### 5d. `window` — no conflict ✅

`Libraries/Core/setUpGlobals.js:18-20` sets `global.window = global` only when
undefined. wolf-tui sets `g['window'] = globalThis` — identical. No action.

### 5e. `Node` / `Element` / `HTMLElement` / `Text` — a REAL collision ⚠️

`src/private/setup/setUpDOM.js` polyfills `Node`, `Element`, `HTMLElement`,
`Text`, `Document`, `CharacterData`, `Event`, `EventTarget`, `CustomEvent`,
`NodeList`, `HTMLCollection`, `DOMRect`/`DOMRectReadOnly`/`DOMRectList`. It is
called unconditionally from `src/private/setup/setUpDefaultReactNativeEnvironment.js:23`.

Our shim must own `Node`, `Element`, `HTMLElement`, `Text` (plus `SVGElement`,
`Comment`, `DocumentFragment`, which RN does not define). **Four head-on
collisions**, and they are **unavoidable by construction** — `init_operations()`
reads `Node.prototype`, so the shim has to be the global.

`polyfillGlobal` yields `writable: true` (`Libraries/Utilities/PolyfillFunctions.js:39-49`),
so **the overwrite succeeds silently** — no throw, no warning.

**Why the blast radius is nevertheless narrow:**

1. **RN's own internals do not break.** Every RN `instanceof` check references the
   *imported class*, not the global — `instanceof ReactNativeElement`,
   `instanceof ReadOnlyElement` (`MutationObserver.js:75`,
   `IntersectionObserver.js:90,217,243`, `ReactNativeResponder.js:588`,
   `getScrollParent.js:30,40`, `VirtualRowGenerator.js:34`).
2. **Our own code does not break.** A repo-wide grep for
   `instanceof (Node|Element|HTMLElement|Text|Comment|DocumentFragment)` returns
   **zero matches**.
3. **React-based RN component libraries are already out of scope** under
   `<third_party_rn_packages_are_react_only>` (CLAUDE.md), so they are not
   exposed to this in a Svelte app.

**What DOES break:** the boundary. A real host instance from a ref is a
`ReactNativeElement`; after the patch `hostInstance instanceof Element` is
`false`, because global `Element` is now ours. Any third-party code doing
`instanceof Node` / `instanceof Element` gets the wrong answer in both
directions.

**The exposure that actually matters is Svelte-side, not RN-side.** A Svelte
developer will reach for *Svelte/web ecosystem* packages, which are written for
browsers and do sniff the DOM. Under a shim those libraries **half-work** rather
than failing fast. Compare `symbiote-web-lib-portability-check`, which records
the project's independently-reached position on exactly this class of problem
(the `react-router` rejection): prefer a dependency that fails honestly over one
that works by accident.

---

## §6. Event names — the lucky break, and the trap

### The lucky break

Two measured facts combine in our favour:

1. **Svelte does not lowercase event names.**
   `compiler/phases/3-transform/client/visitors/shared/events.js:16` is literally
   `let event_name = node.name.slice(2);`. So `onPress` → `'Press'`,
   `onChangeText` → `'ChangeText'`.
2. **The delegated-event list is 23 all-lowercase DOM names.**
   `src/utils.js:110-134`:

   ```
   beforeinput, click, change, dblclick, contextmenu, focusin, focusout,
   input, keydown, keyup, mousedown, mousemove, mouseout, mouseover, mouseup,
   pointerdown, pointermove, pointerout, pointerover, pointerup,
   touchend, touchmove, touchstart
   ```

**None of our camelCase names can ever match.** Every SymbioteNative event
therefore takes the ordinary `addEventListener` path, which the shim routes
straight into the engine's `setEventListener`. **Delegation never enters our
picture at all** — a large category of expected pain that simply does not apply.

### The name mapping the shim owns

Svelte hands the shim `addEventListener('Press', handler)`. The engine's
`routeProp` (`core/engine/src/node.ts:143-155`) works in terms of `onX` → `x`
(`onChange` → `change`). So the shim must lowercase the first character —
`'Press'` → `'press'` — before calling `setEventListener`. Small, but it is a
mapping the shim owns and must test.

### The trap

If an app author writes **lowercase** `onclick` / `onchange` / `oninput` /
`onkeydown` (etc. — any of the 23), Svelte routes it through **delegation**, the
shim's `addEventListener` is never called, and the handler **silently never
fires**.

> **This is dev-warning candidate #1.** Emit a `dlog`/console warning whenever a
> lowercase delegated-event name is seen on a Symbiote host element, telling the
> author to use `onPress` (or the appropriate SymbioteNative name).

### Dev warnings are mandatory, not optional

The shim's defining weakness is silent failure (§4). Every forbidden or
non-functional construct must be made **loud** at dev time:

- lowercase delegated event names (above);
- `bind:` on a Symbiote host element;
- `transition:` / `animate:` / `in:` / `out:` usage;
- `<svelte:head|window|body|document>`.

With those warnings the shim's worst property is largely neutralised. Without
them, the adapter ships a class of bug that is undiagnosable from the app side.

---

## §7. What to re-check on EVERY `svelte` version bump

Ordered by fragility. None of this is public API; none of it carries a
compatibility guarantee.

1. **`init_operations()` (`dom/operations.js:38-75`)** — 3 prototypes, 2
   descriptor extractions, 5 private fields (`__e`, `CLASS_CACHE`,
   `ATTRIBUTES_CACHE`, `STYLE_CACHE`, `TEXT_CACHE`). The most private thing we
   depend on. If Svelte changes how it caches node access, the shim stops
   working wholesale.
2. **`DELEGATED_EVENTS` (`src/utils.js:110-134`)** — if a name is added that
   collides with one of ours, that event silently dies. Diff this list on every
   bump.
3. **`cloneNode(true)` semantics in `from_tree` (`dom/template.js:244-246`)** —
   our clone must faithfully copy attributes and must **not** carry listeners.
   If Svelte changes when or what it clones, instance state leaks between
   component instances.
4. **Module-load order / `IS_XHTML` (`constants.js:80-83`)** — if Svelte adds
   another module-level DOM access, `patchGlobals()` timing becomes even more
   load-bearing.
5. **`handle_event_propagation`'s event-property reads (`dom/elements/events.js`,
   ~lines 200-300)** — currently just `event.target` and `event.cancelBubble`. If
   it starts reading `composedPath()`, `currentTarget`, or `eventPhase`, our
   `ISymbioteEvent` must grow to match.

**Suggested guard:** a test that imports Svelte's own `utils.js` and asserts the
`DELEGATED_EVENTS` list is byte-identical to a vendored copy, so a bump fails CI
rather than a user's screen.

---

## §8. Design decision: the engine node must be LAZY (do not copy wolf-tui here)

`wolf-tui`'s `WolfieElement` creates its core node **eagerly in the constructor**
(`domElement`, delegated via `_coreDomAppend` / `_coreDomInsertBefore` /
`_coreDomRemove`, `wolfie-element.ts:615-689`). For us that would be wrong.

**Why:** §3c established that `from_tree` builds each template graph **once** and
then `cloneNode(true)`s it per component instance. Those template nodes are
**prototypes** — they are never inserted into a live tree. Creating an
`ISymbioteNode` for each of them would (a) allocate engine nodes that never
render, and (b) force `cloneNode` to deep-clone engine nodes too, with all the
prop/listener-copying bugs that implies.

**Do instead:** the shim node creates its `ISymbioteNode` **lazily**, at the
moment it is first inserted into a live tree. Then:

- template prototypes never touch the engine at all;
- `cloneNode(true)` copies only the shim structure — cheap and total;
- only the live branch reaches `@symbiote-native/engine`.

This removes the "third tree" precisely where it would have been most expensive.
The layering becomes: **shim tree (thin, mostly template prototypes) → engine
retained tree (live nodes only) → Fabric child sets.**

Note also the anchor/comment impedance visible in
`wolfie-element.ts:640-680`: because a comment has no core node, wolf-tui hunts
for the next non-comment sibling to position against. We have the same shape —
the engine's `createAnchor` / `isAnchor` nodes are skipped by the commit walk —
so expect and test that path.

---

## §9. How to re-measure (do this instead of trusting this file after a bump)

The vendored reference paths in this repo (`.vendors/`, `wolf-tui/`) are
**symlinks to the author's local machine** and are broken in any other checkout.
Clone the real sources instead:

```bash
git clone --depth 1 https://github.com/sveltejs/svelte /workspace/sveltejs/svelte
git clone --depth 1 --branch v0.86.0 https://github.com/facebook/react-native /workspace/facebook/react-native
git clone --depth 1 https://github.com/OneEyed1366/wolf-tui /workspace/oneeyed1366/wolf-tui
```

Then:

```bash
# The whole DOM surface the client runtime touches
cd /workspace/sveltejs/svelte/packages/svelte/src/internal/client
grep -rnoE "\bdocument\.[a-zA-Z]+|\bnavigator\.[a-zA-Z]+" . | sed 's/.*://' | sort | uniq -c | sort -rn

# The delegated-event list
grep -n -A30 "const DELEGATED_EVENTS" /workspace/sveltejs/svelte/packages/svelte/src/utils.js

# RN's DOM-class polyfills
cat /workspace/facebook/react-native/packages/react-native/src/private/setup/setUpDOM.js
```

Confirm the `svelte` version you measured (`packages/svelte/package.json`) and
record it at the top of this file.

---

## §10. Estimated size, and what NOT to port from wolf-tui

wolf-tui's shim is 1271 lines. Ours should land at roughly **350-450**, because
three large chunks do not apply:

| wolf-tui code | Why we skip it |
| --- | --- |
| `parseHTMLIntoFragment` + `createTemplateFragment` (`wolfie-document.ts:81-147`) | `fragments: 'tree'` means `from_html` is never used. |
| `className` / `classList` / style-proxy (`wolfie-element.ts:423-510`) | Class + style merging is already centralised cross-adapter in `routeProp` (`core/engine/src/node.ts`). Reimplementing it in the shim would duplicate — and diverge from — React/Vue/Angular behaviour. |
| Eager core-node creation + `_coreDom*` delegation (`wolfie-element.ts:615-689`) | Replaced by the lazy-engine-node design (§8). |

What we *do* need that wolf-tui has: the `WolfieNode → Element / Text / Comment /
DocumentFragment` class hierarchy with prototype getters, the mutation methods
with correct DOM move semantics, `cloneNode`, the attribute methods, and
`addEventListener`/`removeEventListener`.

**Already free from the engine — do not reimplement:** move-on-insert
(`appendChild`/`insertBefore` already call `detach`, `core/engine/src/node.ts:277-292`),
null-parent-when-detached (`node.ts:270-298`), and comment/anchor nodes that the
commit walk skips (`createAnchor`/`isAnchor`, `node.ts:112-118`). These are the
three semantics Svelte's maintainer specifically flagged in issue #47; all three
already hold.

---

## §11. Related skills and references

- `symbiote-new-adapter` — the generic "add an adapter" workflow.
- `symbiote-engine-core` — the mutation API the shim ultimately drives.
- `symbiote-add-component` — the three-layer component split; Svelte's lifecycle
  layer will be runes (`$state`/`$derived`/`$effect`) plus a
  `descriptorToSvelte` bridge.
- `symbiote-web-lib-portability-check` — the project's position on web libraries
  that "work by accident"; directly relevant to §5e.
- `symbiote-dev-examples` — the Svelte canary belongs in `.examples/svelte`
  (workspace-linked dev harness), **never** in `examples/svelte` until published.
- `symbiote-dependency-catalog` — `svelte` must be added to the catalog in
  `pnpm-workspace.yaml`, not written as a literal version in a package.
- GitHub issue **#47** in this repo — where Svelte maintainer `benmccann` and
  custom-renderer author `paoloricciuti` offered help; the source of the original
  pointers and of the `@attach` recommendation.
- [sveltejs/svelte#18042](https://github.com/sveltejs/svelte/pull/18042) — the
  official custom-renderer API to migrate to once shipped.
