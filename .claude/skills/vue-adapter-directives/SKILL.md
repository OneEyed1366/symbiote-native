---
name: vue-adapter-directives
description: "Symbiote Vue adapter — compiler-injected runtime helper shims (v-show, Teleport, custom directives) over the non-DOM renderer, PLUS createTunnel for cross-surface content sharing. Read BEFORE touching examples/*/metro-vue-transformer.js, any 'from vue' import rewrite, wiring a Vue built-in (v-show, Teleport) or custom directive over a host node, or reaching for cross-surface content sharing. Covers why v-show/Teleport silently no-op or fail to build by default, the runtime-helpers shim (adapters/vue/src/runtime-helpers/index.ts), setNativeProps for v-show, isTeleportTarget as Teleport's guard (Teleport itself lives in adapters/vue/src/create-portal/ and is exported from the package barrel), and why same-surface-only is Teleport's PERMANENT scope, not a gap — use createTunnel (adapters/vue/src/create-tunnel/index.ts, its In/Out are SLOT-BASED COMPONENTS, not composables — the React twin also lands on In/Out components, not hooks, after an earlier hook version caused a real infinite-render-loop bug) instead, do not invent commit-scheduling plumbing or duck-typed validation for any of this."
---

# Symbiote Vue adapter — runtime directive shims over a non-DOM renderer

Vue's SFC compiler does not treat every built-in as ordinary template sugar. A
handful — `v-show`, `<Teleport>`, the native-element `v-model` family (`v-model`
on a bare `<input>`/`<select>`) — compile to an import of a **runtime helper
object** (`vShow`, `Teleport`, `vModelText`, `vModelCheckbox`, `vModelSelect`)
from the module named `'vue'`. `vShow`/`vModelText`/etc. are written in
`@vue/runtime-dom` directly against a real `HTMLElement` (`el.style.display`,
`el.value`, `addEventListener`) — meaningless for us, since we have no DOM.
`Teleport` itself lives in the renderer-agnostic `@vue/runtime-core` (it only
needs generic renderer ops — `insert`/`remove`/`parentNode`/`nextSibling`, all
already implemented in `renderer.ts`), but its `to` target resolves through
`querySelector` when given a string, and `renderer.ts` stubs that permanently to
`() => null` (RN has no DOM selector concept) — so a `to="#id"`-style target is
dead by design, same as `insertStaticContent`.

## Why `v-show` breaks by default, concretely

Retargeting Metro's `from 'vue'` rewrite straight at bare `@vue/runtime-core`
(so the compiler's injected `ref`, `computed`, `openBlock`, `withDirectives`,
etc. resolve to the renderer-agnostic package, not `runtime-dom`) is correct for
those helpers, but `v-show` compiles to `import { vShow as _vShow } from 'vue'`
too — and `@vue/runtime-core` does not export `vShow` at all. Pointing straight
at `@vue/runtime-core` leaves this either failing at build/import time or
resolving to `undefined`, so the directive hook silently never runs. `v-show` is
not "unsupported by design" — it was a real, previously-unfixed gap (now fixed;
see below).

## The fix — a runtime-helpers shim, not a ban

This is DONE — `examples/*/metro-vue-transformer.js` already retargets every
`from 'vue'` to `@symbiote-native/vue/runtime-helpers`, not bare `@vue/runtime-core`.
`adapters/vue/src/runtime-helpers.ts` is the shim module:

```ts
export * from '@vue/runtime-core';

import type { ObjectDirective } from '@vue/runtime-core';
import {
  setNativeProps,
  whenCommitted,
  type ISymbioteNode,
} from '@symbiote-native/engine';

// whenCommitted, not a bare call: Vue's `mounted` hook fires synchronously during the
// patch pass, but this renderer coalesces the actual Fabric commit onto a microtask
// (surface.requestCommit()) — the SAME async-commit race TextInput's autoFocus guards
// against (vue-adapter-reactivity). A bare setNativeProps here would silently no-op on
// the very first mount, with no retry.
const pendingShowCommits = new WeakMap<ISymbioteNode, () => void>();

function applyShow(el: ISymbioteNode, value: boolean): void {
  pendingShowCommits.get(el)?.();
  const cancel = whenCommitted(el, () =>
    setNativeProps(el, { style: { display: value ? undefined : 'none' } }),
  );
  pendingShowCommits.set(el, cancel);
}

export const vShow: ObjectDirective<ISymbioteNode, boolean> = {
  mounted: (el, { value }) => applyShow(el, value),
  updated: (el, { value }) => applyShow(el, value),
  // Drop a still-pending first-commit wait if the element unmounts before it ever lands.
  unmounted: el => pendingShowCommits.get(el)?.(),
};
```

The naive version (a bare `setNativeProps` call, no `whenCommitted`) passes a
manual smoke check that mounts already-visible, but fails silently the moment
the FIRST render is hidden (`v-show="false"` from the start) — the exact
headless-green/native-frozen split `vue-adapter-reactivity` warns about. Prove
it with a test that mounts hidden and asserts `display: 'none'` after a tick,
not just a toggle-after-mount case.

The regex doing the Metro rewrite (`/from\s*(['"])vue\1/g`) only matches the bare
specifier `'vue'`, not `'vue-router'` or similar, so it needed no change beyond
the replacement target string.

## The imperative primitive — reuse `setNativeProps`, do not reinvent it

A directive hook runs OUTSIDE the renderer's own `patchProp` path (see
`adapters/vue/src/renderer.ts`), so it has no closure over the mounted
`SymbioteSurface` to call `requestCommit()` on. Do not invent new plumbing to work
around this. `setNativeProps(node, partial)` (`core/engine/src/commit.ts`, ~line 603) already exists for exactly this shape of problem — the JS-driven Animated
native-frame path uses it for the same reason (full imperative/native-bridge
surface: `symbiote-engine-core`). It:

- looks up the node's own `rootTag` via the engine's internal `mirror` WeakMap and
  re-commits that root directly — no surface reference needed by the caller;
- merges a partial `style` object non-destructively (`{...current, ...partial}`),
  so toggling `display` never clobbers the component's own declarative style;
- is already framework-agnostic — it is exported from `@symbiote-native/engine`, not
  something Vue-specific to add.

Any future "read/write a committed node's props from outside the normal render
path" need (another custom directive, a plugin) should reach for `setNativeProps`
first, not schedule its own commit.

## `Teleport` — a validating wrapper, not a directive shim

**Lives in `adapters/vue/src/create-portal/index.ts` (2026-08-20), re-exported by
`runtime-helpers/index.ts` and by the package barrel `adapters/vue/src/index.ts`.**
It moved out of `runtime-helpers` so the adapter's portal sits where every other
adapter's does (`create-portal/`), and it reached the BARREL because an audit found
Vue exported no portal capability under any name — the shim existed but only via the
`@symbiote-native/vue/runtime-helpers` subpath, so `examples/vue-tsx` had to import it
from there. The `runtime-helpers` re-export must stay: that module is what Metro
rewrites `from 'vue'` to, and its `export * from '@vue/runtime-core'` would otherwise
resolve `Teleport` to the UNGUARDED original.

Confirmed by actually compiling a probe SFC through `@vue/compiler-sfc`'s
`compileScript`: `<Teleport>` in a template compiles to `import { Teleport as
_Teleport } from 'vue'` — the SAME interception point as `vShow`, so it needs no
new Metro work, just one more export from that module:

```ts
import { defineComponent, h, Teleport as VueTeleport } from '@vue/runtime-core';
import { isSymbioteNode } from '@symbiote-native/engine';

export const Teleport = defineComponent({
  name: 'Teleport',
  inheritAttrs: false,
  props: {
    to: { type: null, default: null }, // `type: null` = skip Vue's own type check
    disabled: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    return () => {
      const { to } = props;
      if (typeof to === 'string') {
        throw new Error(
          `Teleport target must be a host node ref, not a CSS-selector string ("${to}") — symbiote has no querySelector.`,
        );
      }
      // isTeleportTarget = `instanceof SymbioteSurface || isSymbioteNode` — the surface
      // root is a legal target too, matching React createPortal's IPortalContainer union.
      if (to != null && !isTeleportTarget(to)) {
        throw new Error('Teleport target is not a real host node.');
      }
      return h(VueTeleport, { to, disabled: props.disabled }, slots);
    };
  },
});
```

This `Teleport` deliberately SHADOWS the one `runtime-helpers`' own
`export * from '@vue/runtime-core'` line already re-exports — an explicit named
export (local declaration OR `export { X } from './x'`) always wins over a
star-reexport of the same name, no duplicate-export build error. The wrapper's only job is validating `to` before delegating
to the real `VueTeleport`; move/insert/remove mechanics are untouched (already
fully generic in `renderer.ts`).

**Why this is a validation wrapper, not a `setNativeProps`-style shim**: unlike
`vShow`, Teleport doesn't call any imperative engine API — it only rearranges the
JS-side retained tree (`insert`/`remove`, both already generic over any host
node). That means **no `whenCommitted` guard is needed here** — a target that
exists (passes `isSymbioteNode`) but hasn't had its first native commit yet still
works correctly once the next commit lands, because the move is pure retained-
tree bookkeeping, not a native call needing an already-assigned Fabric tag.

**The safety guard — `isSymbioteNode`, not duck-typing or `whenCommitted`-gating
on "already committed"**: the danger this exists to prevent is a dev handing
Teleport a value it can't safely operate on — a CSS-selector string (the DOM
habit), a plain object, or a Vue ref passed without `.value` — reaching deep into
`insert`/`remove` and corrupting the retained tree with an unclear low-level
error. `isSymbioteNode` (`core/engine/src/node.ts`, exported from
`@symbiote-native/engine`) is the engine's OWN branded-object check (a private `unique
symbol` marker set by `createElement`/`createRawText`/`createAnchor`) — reuse it
rather than inventing a new identity check; it is the SAME guard React's
`createPortal` twin uses (`adapters/react/src/create-portal.ts`). Node-identity
mechanics generally (why a node must be held by identity, the WeakMap mirror
this check backs) live in `symbiote-engine-core`.

**Scope — same-surface targets only** (mirrors the React `createPortal` twin):
the target must be a node already mounted in the SAME surface as the Teleport
call site (e.g. a persistent "overlay host" `View` near the app root), not a
node belonging to a separately-`mount()`-ed root. A different surface's own
commit is never triggered by this renderer's `surface.requestCommit()` (it is
bound to ONE surface via closure in `createSymbioteRenderer`), so a cross-surface
target would move nodes without ever repainting them — a silent no-op, not a
crash. Cross-surface support is a deliberate non-goal for v1, not an oversight.

### Everything stock Teleport already does over this renderer — measured, not assumed

Probed 2026-08-20 against `@vue/runtime-core` 3.5.39 before writing anything, because the
alternative was hand-rolling a parallel API next to a built-in that works. `resolveTarget`
consults the `querySelector` renderer option ONLY for the STRING form of `to`; an object
target is returned untouched, which is why Vue's own Teleport suite passes against
`@vue/runtime-test`, whose `querySelector` throws. So Teleport needs NOTHING from this
renderer that it does not already have — zero `RendererOptions` were added.

All six pinned in `adapters/vue/src/create-portal/create-portal.test.ts`:

| capability                                                            | works                                                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| lands under a target held only by a `ref`, out of its template parent | yes                                                                                                                     |
| DIRECT child of the target, no wrapper node                           | yes — Teleport's two `createText('')` anchors map to engine anchors, which the commit walk drops (`renderableChildren`) |
| target = the `SymbioteSurface` root                                   | yes, once the guard stopped rejecting it                                                                                |
| reactive updates keep reaching relocated content                      | yes                                                                                                                     |
| target changes ⟶ nodes MOVE (old target empties)                      | yes — `moveTeleport`, TARGET_CHANGE                                                                                     |
| unmount detaches from the target                                      | yes                                                                                                                     |
| `disabled` keeps content in place                                     | yes                                                                                                                     |
| call-site `provide`/`inject` preserved                                | yes — the vnode never leaves the call site's component tree                                                             |

The last row is the one `createTunnel` answers the OPPOSITE way (its `In` hands over a
SLOT that `Out` invokes, so `inject` resolves at the OUT site) — pinned as a matched pair
in `create-tunnel/create-tunnel.test.ts`. That is the measured proof portal ≠ tunnel, not
a naming divergence.

## Live examples — SFC vs TSX get the guard differently

The demo lives in each app's `screens/CanaryScreen.*`, not `App.*`.

```
§demo_relocation_regression := {
  cause: "CanaryScreen moved one level deeper into the nav tree when
          @symbiote-native/navigation gave each app a real Menu as its
          initial route (2026-07)",
  regression: "examples/react, examples/vue-sfc, examples/vue-tsx post-move
               kept only a Modal demo; examples/angular/screens/CanaryScreen.ts
               kept its *portal/*tunnelIn twin throughout, unaffected",
  fix: "Teleport/createTunnel demo restored to examples/vue-sfc's
        CanaryScreen.vue, brought back to parity with Angular",
}
```

`examples/vue-sfc/screens/CanaryScreen.vue` has a "Show toast (Teleport)"
button: the overlay host is a persistent, empty `<View pointer-events="box-none">`
rendered as a SIBLING of the root `ScrollView`, referenced via a plain string
`ref=` + `shallowRef` (not `ref()` — Gotcha 1 in `vue-adapter-reactivity`). The
SFC's `<Teleport>` is compiler-injected and auto-retargeted by
`metro-vue-transformer.js`, so it gets our validating wrapper for free. A
second button, "Show toast (createTunnel)", demos a module-level
`createTunnel()` singleton's `TunnelIn`/`TunnelOut` (destructured to PascalCase
in `<script setup>` so the SFC compiler auto-registers them as template tags).

`examples/vue-tsx/screens/CanaryScreen.tsx` needs one extra step: its
`metro.config.js` aliases bare `'vue'` straight to `@vue/runtime-core` (no
transformer interception — see that file's own top comment), so a plain
`import { Teleport } from 'vue'` there would be the REAL, unguarded component.
The TSX demo instead imports `{ Teleport } from '@symbiote-native/vue/runtime-helpers'`
explicitly — the one line in that file that deviates from its usual `from 'vue'`
pattern. Its createTunnel twin reuses the pre-existing module-level singleton in
`examples/vue-tsx/tunnel-demo.ts` (`export const tunnelDemo = createTunnel();`),
imported into `CanaryScreen.tsx` rather than declared inline.

## Scope — what this does NOT cover

- **Native-element `v-model` directives** (`vModelText`/`vModelCheckbox`/
  `vModelSelect`) are out of scope and are not being shimmed: there is no bare
  native `<input>`/`<select>` host tag in this renderer — every input goes through
  a component wrapper (`TextInput`, etc.), and `v-model` on a _component_ is pure
  prop+emit compiler sugar needing no runtime helper at all. See
  `vue-adapter-events` (Rule 6) for that path.
- **`v-model` on Symbiote components** (`TextInput`, `Switch`, `Slider`, …) —
  `vue-adapter-events` Rule 6 owns this; it is a component-level prop/emit
  convention (`resolveModelValue`/`emitModelUpdate`), not a directive shim.
- **Scoped slots / `#item`** — `vue-adapter-slots`.
- **`<style>` blocks in SFCs** — no CSS meaning today; styles are JS
  `StyleSheet.create` objects (see project `CLAUDE.md`, Styling section). Not a
  directive concern.
- **`<Transition>`/`<TransitionGroup>` are NOT shimmed**, unlike `v-show`/
  `Teleport`/`vModel*` above — neither is exported by `@vue/runtime-core` at
  all, so `import { Transition } from 'vue'` through the Metro rewrite this
  file documents resolves to `undefined`.

  **CORRECTED 2026-08-20 — this entry used to claim that was "a hard failure,
  not a silent no-op". It is the opposite, and it was measured:** `h(undefined,
…)` does NOT throw. The child subtree simply never renders, accompanied by a
  dev-only warning (`Invalid vnode type when creating vnode: undefined.`) that
  is compiled out of a release bundle. So in production the content just
  vanishes with no signal at all — the worst failure shape in the whole Vue
  surface, and worse than the unshimmed `v-show` this entry compared it
  favourably against. The claim came from reading type defs rather than from
  mounting it; see `.claude/rules/framework-builtins-reuse.md` for the rule
  that would have caught it.

  Two ways out, either acceptable: shim both over **`BaseTransition`**, which
  IS in runtime-core and is **probed working** here (`onBeforeLeave`/`onLeave`/
  `onAfterLeave` fire, and the node stays committed until `done()` — so a JS
  transition can drive `Animated` and call `done()`); or, minimally, export a
  THROWING stub named `Transition`/`TransitionGroup` from `runtime-helpers` so
  the failure is loud. Doing neither leaves a silent content-disappears bug.

- **`KeepAlive` and `Suspense` are NOT unwired — both are probed WORKING**
  (2026-08-20), against the fake Fabric slot through the adapter's own
  `mount()`. This entry previously listed them as "unwired/untested". `KeepAlive`
  parks a subtree by `move`-ing it into a `createElement('div')` container it
  makes itself, which never reaches the surface, so the commit walk never sees
  it and no `div` view name is created; `appendChild`'s `detach()` is what makes
  the park a real removal rather than a duplication. Measured: restoring a
  cached screen creates **zero** native views (Fabric re-appends the same
  family), and a parked screen costs `completeRoot` delta 0 per change.
  `Suspense` likewise removes stale content rather than stacking it. Neither
  needs a single added `RendererOption`.

  **Why Vue gets this right where React does not**, and it is worth
  understanding rather than memorising: React's contract asks the HOST to hide a
  subtree (`hideInstance`/`unhideInstance`), and ours are no-ops, so React's
  re-suspending `Suspense` and `Activity` paint stale content stacked under the
  fallback. Vue's contract asks the TREE to move, which our `appendChild` +
  `detach` + surface-rooted commit walk already implement correctly. The
  correctness therefore rests on `detach()` staying inside `appendChild` — if
  that ever moves, `KeepAlive` degrades into React's stacked-content bug,
  silently.

- **Teleport to a second, independently-mounted `SymbioteSurface`** —
  same-surface-only is Teleport's PERMANENT scope (see above), not a gap to
  eventually fill. For genuine cross-surface content sharing use
  `createTunnel` (`adapters/vue/src/create-tunnel/index.ts`) instead — its `In`/
  `Out` are ordinary COMPONENTS (`<tunnel.In>…</tunnel.In>` / `<tunnel.Out
/>`, slot-based, no `h()` in app code — a composable can't accept template
  markup, only a component has a slot). The React twin (`create-tunnel.tsx`)
  ALSO lands on `In`/`Out` as components, not hooks — there an earlier
  hook-based version (`useTunnelIn`/`useTunnelOut`, called directly inside
  one component) caused a genuine infinite render loop, fixed by making them
  separate components so a forced re-render of `Out` has nowhere to bounce
  back into `In`. A shared store, not a node reference, so there's no
  `isSymbioteNode` guard to satisfy and no foreign-surface commit to
  trigger; the target surface commits itself, normally, reacting to the
  shared state like any other Vue reactivity. Researched before deciding
  this: `facebook/react#17147` and `pmndrs/tunnel-rat` show the React
  ecosystem hit and solved this exact class of problem the same way — see
  `react-adapter-portal`'s matching section for the full writeup and sources.
  Angular has both twins too (`angular-adapter-portal`) — `PortalDirective`/
  `PortalOutletDirective` and `createTunnel`'s `TunnelInDirective`/
  `TunnelOut` — but neither can be a per-call factory like this file's
  `In`/`Out`: Angular can't synthesize components at runtime (no JIT under
  Metro/Hermes), so `createTunnel()` there returns only a plain
  signal-backed store and both are ONE static, pre-authored pair
  parameterized by an input. `PortalDirective`/`TunnelInDirective` are also
  STRUCTURAL directives (`*portal="x"`, the `*ngIf` idiom), not components
  taking a separate `<ng-template>` — Angular's own equivalent of "a
  component, since a composable can't accept template markup" reasoning
  above, just solved with directive-on-content instead of slots.

## Verification checklist

1. Confirm the Metro transformer's `from 'vue'` rewrite target is the shim
   module, not `@vue/runtime-core` directly.
2. Confirm the shim re-exports `* from '@vue/runtime-core'` so nothing else the
   compiler injects (`ref`, `withDirectives`, `openBlock`, `Teleport`, …) breaks,
   and that any locally-defined export (like `Teleport`) intentionally shadows
   the star-reexport rather than accidentally duplicating it.
3. Confirm any new directive/wrapper implementation reaches for an EXISTING
   engine primitive — `setNativeProps` for an imperative prop write,
   `isSymbioteNode` for a target-identity guard — rather than holding its own
   surface reference, scheduling a bespoke commit, or duck-typing validation.
4. Smoke-test `v-show` toggling in a running example: element unmounts visually
   (`display: 'none'`) and restores its original style on toggle-back, without
   dropping other declarative style fields.
5. Smoke-test `Teleport` in a running example: content renders under the target
   node's position, not its own template position, and a deliberately-wrong `to`
   (a string, an unrelated object) throws immediately rather than silently
   failing or corrupting the tree.

## Common failure modes

| Failure                                               | Cause                                                                                                      | Fix                                                                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Build/import error naming `vShow`/`Teleport`          | Metro transformer still points `from 'vue'` at `@vue/runtime-core`                                         | Retarget to the runtime-helpers shim                                                                                                     |
| `v-show` toggles once then never again                | Directive computed `style` once instead of in both `mounted` and `updated`                                 | Apply the toggle in both hooks                                                                                                           |
| Toggling display wipes other style props              | Wrote `style: {display: ...}` directly instead of via `setNativeProps`'s merge                             | Use `setNativeProps`, never a raw prop overwrite                                                                                         |
| A new directive silently does nothing                 | Assumed a `SymbioteSurface` reference was available in the hook                                            | Use `setNativeProps`, which needs only the node                                                                                          |
| `Teleport` content never appears, no error            | `to` targets a node in a DIFFERENT, separately-mounted surface                                             | Out of v1 scope — target must be in the SAME surface                                                                                     |
| `Teleport` throws "not a real host node" unexpectedly | Passed a Vue `ref` object itself instead of `ref.value`, or read the ref before its first render committed | Read `.value`; a not-yet-committed-but-real node still passes `isSymbioteNode` — recheck the value actually came from a rendered element |
