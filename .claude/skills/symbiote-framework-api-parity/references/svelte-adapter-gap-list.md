# Svelte adapter gap list (audited 2026-09-25, against svelte-api-surface.md)

Architecture note: unlike React/Vue (custom reconciler/renderer), Svelte compiles to plain DOM
calls and this adapter is a DOM SHIM underneath (`adapters/svelte/src/dom-shim/`) - stock
compiled Svelte output believes it is talking to a real DOM. So most of the guide surface (runes,
`{#if}/{#each}/{#await}/{#key}/{#snippet}`, `{@const}`, stores, context, lifecycle) is pure
JS/compiler output with no DOM dependency and works by construction; the gaps are concentrated in
the few places Svelte's runtime reaches for a REAL browser API the shim never modeled.

Stale reference found, not fixed here (out of scope, too large for this pass): 36 comments across
`adapters/svelte/src` cite a "svelte-adapter-dom-shim" reference document, by section number
(§2, §7, §15...), that does not exist anywhere in this repo or the user's global setup - only two
example READMEs link to it. Same class of staleness as `PortalDemo.tsx`'s dead reference found in
the React pass, but far larger in blast radius: every §-numbered comment in this adapter points
at a document that isn't there. Flagging for a separate cleanup task, not rewriting 36 comments
in this pass.

## Confirmed working, pure JS/compiler surface (read + spot-checked, no DOM dependency)

Runes (`$state`/`$derived`/`$effect`/`$props`/`$bindable`/`$inspect`; 91/39/70/56/5/2 files use
them respectively), `{#snippet}`/`{@render}` (25/18 files), `{@const}` (6 files), `<svelte:
boundary>` (11 files, own smoke test), `<svelte:element>` (6 files), `svelte/store` (writable/
derived/readable, pure JS, no DOM read anywhere in svelte's own store source), `svelte/motion`
(`spring`/`tweened`, pure JS + `requestAnimationFrame`, no `getComputedStyle`/DOM read), context
API (`setContext`/`getContext`), lifecycle (`onMount`/`onDestroy`/`tick`), `bind:this` (30
files), `use:`/`{@attach}` (attachments.ts, the documented Svelte-side twin of Vue's custom
directives - `use:`/`transition:`/`class:`/`style:` are compiler-rejected ON COMPONENTS by
Svelte itself, `{@attach}` is the one directive that compiles on both elements and components).

## Found broken, then built (2026-09-25)

All three shared one root cause: `patch-globals.ts` installed only what the MANDATORY
mount/patch/event path reads, and three ordinary guide features reached further into real
browser APIs that were never in that list and are not RN globals either.

1. **`transition:`/`in:`/`out:`** (`fade`/`fly`/`slide`/`scale`/`blur`) used to crash the app the
   first time a transition actually played (intro is suppressed on the very first paint, stock
   Svelte behavior, so a naive "mount and check" test was vacuous). `fade()` calls the bare
   global `getComputedStyle` (not `document.getComputedStyle`), then Svelte 5's own transition
   runtime calls `element.animate(keyframes, options)` - the real Web Animations API subset, not
   Svelte 3/4's manual per-frame `style` mutation. Both were entirely unimplemented.
   Built: `dom-shim/computed-style.ts` (a `getComputedStyle` reading the element's own style bag,
   with real-DOM-shaped defaults, via a `Proxy` since callers build key names at runtime), a bare
   global patch in `patch-globals.ts`, and `dom-shim/animation.ts` (`Element.animate()` as a
   keyframe-replay player - Svelte itself already bakes every intermediate frame via its own
   `css(t, u)` tick loop, so this only has to play the array back over real time and write each
   frame's `style` through `routeProp`, not interpolate). Verified real, not vacuous:
   `transition-directive.smoke.test.ts`'s fade case toggles hidden -> shown -> waits -> asserts
   `payload.opacity` actually reaches ~1, not merely "did not throw".
2. **`animate:flip`** (and, by the same code path, `crossfade`) used to throw on any keyed
   reorder: `flip()` calls `this.element.getBoundingClientRect()`, which `ShimElement` never
   defined. Built: `ShimElement.getBoundingClientRect()`, backed by a new synchronous engine
   export mirroring `nativeFabricUIManager.getBoundingClientRect`'s own direct-return shape
   (`core/engine/src/imperative.ts`'s `getBoundingClientRect`, threaded through `ITreeHost`/
   `INativeEngineBindings` as an OPTIONAL member so an older native binary keeps passing
   `isBindings` unmodified). Headless test-utils fake added (`recording-host.ts`, answers a fixed
   zero rect, the same "answers nothing real" precedent `measure`/`measureInWindow` already had).
   **Native (C++) side not implemented in this pass**: RN's own vendored `react::dom::
   getBoundingClientRect(revision, shadowNode, includeTransform)` is confirmed to already exist
   and mirrors `measureInWindow`'s existing `Tree::measureInWindow` C++ pattern closely, so wiring
   it is a natural, low-risk follow-up - deliberately not attempted here because it cannot be
   compiled or device-verified without a native rebuild, which this session does not do. Until
   that lands, `getBoundingClientRect` answers `undefined` on a real device (degrading exactly
   like an older binary lacking the member), and `ShimElement.getBoundingClientRect()` falls back
   to a zero rect - flip no longer crashes, but does not yet see real geometry on device either.
3. **`createEventDispatcher`** used to throw the first time a listened-to `dispatch()` actually
   fired: its event is `new CustomEvent(type, {...})` (svelte's `create_custom_event`), and
   `CustomEvent` was not a patched global. Fixed with a small `FakeCustomEvent` class (`type`/
   `detail`/`bubbles`/`cancelable`/`defaultPrevented`/`preventDefault()`) patched the same way
   `HTMLMediaElement` already is. Verified end-to-end with a real parent `on:ping` listener
   (`create-event-dispatcher.smoke.test.ts`), not just a constructor smoke test - Node's own
   global `CustomEvent` (shipped since Node 19, RN has none) would have silently masked this gap
   in vitest if patch-globals.ts had not been checked to actually override it during a mount.

## Depth check kept for the record: why these looked architecturally deep at first

- `getComputedStyle` returning something is easy; the harder-looking part, `element.animate()`
  being the Web Animations API, turned out not to need real interpolation once traced through
  Svelte's own source - it pre-bakes every frame, so a dumb time-based playback is the correct,
  complete implementation, not a simplification.
- `getBoundingClientRect` needing real layout bounds is still real and unresolved for real device
  geometry (see item 2's native gap above) - Fabric/Yoga layout commits asynchronously and no
  adapter has a synchronous "ask Yoga for this node's box" path yet. `nativeFabricUIManager.
  getBoundingClientRect` itself, however, IS synchronous JSI on the native side (confirmed in
  RN's vendored `FabricUIManager.js`), so the eventual C++ binding is a thin wrapper, not a new
  synchronization mechanism - the "hard, cross-cutting refactor" framing from earlier in this
  pass was wrong once the actual native surface was read instead of assumed.

## `slide`'s box-model reads: approximated, not exact

`slide()` also reads `display`/`height`/`width`/`padding*`/`margin*`/`border*Width` off
`getComputedStyle`. `computed-style.ts` answers these from the element's own AUTHORED style bag
(what the app wrote), not a resolved cascade - correct for the common case (static or
directly-set values), not for values that would need real cascade resolution. Not separately
tested; `fade`/`flip`/`createEventDispatcher` were the three confirmed-broken, now confirmed-
fixed cases this pass targeted.

## Svelte pass: closed (2026-09-25), with one named follow-up

Every item from `svelte-api-surface.md` is `works` or a documented, decided limitation. The one
open item is the native `getBoundingClientRect` C++ binding (item 2 above) - tracked here, not
silently dropped, per this initiative's rule against shipping a reduced surface without saying so.
Next: Solid, per the agreed adapter order.
