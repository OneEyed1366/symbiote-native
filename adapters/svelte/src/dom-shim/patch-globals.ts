// Installs the shim as the DOM globals Svelte's `init_operations()` reads at mount time
// (svelte-adapter-dom-shim skill §2, §3a, §6). Must run before `mount()` (§3f) — not
// necessarily before `svelte` is imported.
//
// Single-root only, by design (§10, decided during Svelte adapter planning 2026-08-11): one
// Symbiote app = one process = one Svelte root, so `restoreGlobals()` needs no ref-counting —
// `unmount()` calls it unconditionally.
//
// Deliberately NOT patched, and must stay that way (§6b, §6c, §6d) — both verified against the
// real vendored RN source (.vendors/react-native/packages/react-native/Libraries/Core/), not
// just asserted:
// - `navigator` — RN's own `setUpNavigator.js` sets `global.navigator = {product:
//   'ReactNative'}` before any app code runs; clobbering it breaks third-party detection
//   silently. `init_operations()` reads `navigator.userAgent` (undefined on RN, since
//   setUpNavigator.js sets no such field) but only via `/Firefox/.test(...)`, which coerces
//   `undefined` to the string `"undefined"` rather than throwing.
// - `requestAnimationFrame` / `cancelAnimationFrame` — `@symbiote-native/engine`'s own Animated
//   driver reads these globals at call time; replacing them would silently degrade every
//   adapter's animations to a 16ms timer, not just Svelte's.
// - `window` — RN's own `setUpGlobals.js` sets `global.window = global` before any app code
//   runs; nothing to do. (A bare Node/vitest sandbox does NOT have this — a test exercising
//   the real mount pipeline needs to replicate it itself; see
//   mount-pipeline.smoke.test.ts's module-level setup.)
//
// `customElements` IS patched, unlike the three above — see its own comment below.

import { dlog } from '@symbiote-native/engine';
import { ShimElement, ShimElementBase } from './element';
import { ShimText } from './text';
import { ShimComment } from './comment';
import { ShimDocumentFragment } from './document-fragment';
import { ShimNode } from './shim-node';
import { getShimDocument } from './document';

const PATCHED_KEYS = [
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Text',
  'Comment',
  'DocumentFragment',
  'document',
  'customElements',
] as const;

// Real DOM's `CustomElementRegistry`. `set_custom_element_data` (svelte's
// dom/elements/attributes.js) reads the BARE global `customElements` unconditionally, with no
// `typeof` guard — an undeclared global throws ReferenceError, not just `undefined`, so this
// must be a real assigned property, not merely absent. Found only by actually running the
// pipeline (mount-pipeline.smoke.test.ts); `tsc --build` has no way to catch a missing global
// a compiled Svelte bundle reads. RN/Hermes has no Custom Elements API of its own to collide
// with (unlike `navigator`/`requestAnimationFrame`, verified against .vendors/react-native —
// see the header comment above), so patching this is safe. `get()` always returns `undefined`
// since we never call `customElements.define()`, which is exactly what steers
// `set_custom_element_data` down the object-bag "set as property" branch every `p={bag}` prop
// needs (skill §3g(c)).
const FAKE_CUSTOM_ELEMENT_REGISTRY = { get: (): undefined => undefined };

type IGlobalRecord = Record<(typeof PATCHED_KEYS)[number], unknown>;

let previous: IGlobalRecord | undefined;

export function patchGlobals(): void {
  if (previous !== undefined) return; // already installed — single root, idempotent
  const g = globalThis as unknown as IGlobalRecord;
  previous = {
    Node: g.Node,
    Element: g.Element,
    HTMLElement: g.HTMLElement,
    SVGElement: g.SVGElement,
    Text: g.Text,
    Comment: g.Comment,
    DocumentFragment: g.DocumentFragment,
    document: g.document,
    customElements: g.customElements,
  };
  g.Node = ShimNode;
  // ShimElementBase, NOT ShimElement: `get_setters` stops AT `Element.prototype`, so pointing this
  // at the class that owns `p` hides `p` from every `set_attributes` caller. See element.ts.
  g.Element = ShimElementBase;
  // Svelte's mandatory paths never distinguish HTMLElement/SVGElement from Element (we have
  // no `<svg>` primitives), so both alias the same class — real, extensible prototypes either
  // way, which is all `init_operations()` requires (§3a).
  g.HTMLElement = ShimElement;
  g.SVGElement = ShimElement;
  g.Text = ShimText;
  g.Comment = ShimComment;
  g.DocumentFragment = ShimDocumentFragment;
  g.document = getShimDocument();
  g.customElements = FAKE_CUSTOM_ELEMENT_REGISTRY;
  dlog('svelte dom-shim: patchGlobals installed');
}

export function restoreGlobals(): void {
  if (previous === undefined) return;
  const g = globalThis as unknown as IGlobalRecord;
  for (const key of PATCHED_KEYS) g[key] = previous[key];
  previous = undefined;
  dlog('svelte dom-shim: restoreGlobals');
}
