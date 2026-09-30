---
name: symbiote-framework-api-parity
description: "Master tracker for the multi-session initiative to bring every adapter (React, Vue, Solid, Svelte, Angular) up to full parity with its underlying framework's own public guide/API surface, not just parity of SymbioteNative's own components across adapters (that's <adapters_reach_full_feature_parity> in CLAUDE.md, a different axis). Read BEFORE resuming this initiative in a new session/ralph-loop iteration, before building or updating a per-framework API surface catalog under references/, or before deciding adapter order/scope for this work. Holds: the adapter priority order, the scope boundary (full official guide surface, ecosystem packages like Router/Pinia/NgRx excluded), the per-framework workflow (catalog -> diff against adapter -> TDD gap -> grill-me for big refactors), and the live status table. Trigger on: 'framework API parity', 'does our React/Vue/Solid/Svelte/Angular adapter support X', 'adapt every framework's syntax sugar', 'framework surface catalog', resuming a ralph-loop session about adapter API coverage."
---

# Framework API parity: master tracker

## Scope (user-decided, 2026-09-25)

Goal: every syntax-sugar/API/method documented in a framework's **own official guide** must work
through our adapter, matching the experience a dev already gets on web with that framework.

- **In scope**: the framework's own guide/API reference in full: reactivity primitives
  (hooks/composables/signals/runes), template syntax and directives, built-in components
  (Suspense/Teleport/Transition/KeepAlive/`*ngIf`/`*ngFor`/`ng-content`...), lifecycle,
  refs, slots/children, context/DI, error boundaries, even parts that don't touch our
  renderer directly (state-management primitives) get verified, since a broken one would
  surprise a web-experienced dev porting to native.
- **Out of scope**: separate ecosystem packages (React Router, Redux, Vue Router, Pinia,
  Angular Router/HttpClient/NgRx, SolidJS Router, SvelteKit). Those are packages, not the
  framework's own guide.
- Browser/DOM-only surface (createPortal-to-DOM-node semantics, `dangerouslySetInnerHTML`,
  `<form>` Actions, hydration, resource preload hints) is still **catalogued**, tagged
  `dom-specific`, and judged for a native-equivalent rather than silently dropped.

## Adapter order (user-decided)

1. **React**, `adapters/react` (M1+M2 done/alpha)
2. **Vue**, `adapters/vue` (M3 done)
3. **Solid**, `adapters/solid` (exists, sizable test suite already; not yet in CLAUDE.md milestones, verify actual coverage rather than trusting that gap)
4. **Svelte**, `adapters/svelte` (exists, sizable test suite already; same caveat as Solid)
5. **Angular**, `adapters/angular` (M4 done, AOT/zoneless, highest-risk refactors)

All five adapter directories already exist and are committed (checked 2026-09-25). "Not yet
built" is not a safe assumption for any of them going forward, only for specific APIs within one.

## Execution constraint (user-decided, 2026-09-25)

**No `Agent`/fork subagents while this runs under `/ralph-loop`.** The user killed a
background fork mid-task and restated the instruction with this rule attached, twice.
Do every step (research, codegraph, edits, test runs) directly in the main loop turn,
even the slow multi-cycle TDD ones. If a step is genuinely too large for one turn,
split it across turns via the status table below, not via delegation.

Current focus (user-narrowed, 2026-09-25): Svelte is closed. React/Vue/Svelte done;
Solid/Angular stay queued.

## Workflow per framework

1. Build/refresh a static API-surface catalog at `references/<framework>-api-surface.md`
   (this skill's own `references/` dir) via context7 + WebSearch + `.vendors/<framework>`
   source, not from memory (training data lags, especially React 19 / Vue 3.5+ / Angular signals).
2. Audit the adapter's actual implementation (codegraph first: `codegraph_context`/
   `codegraph_explore` on the adapter package, Grep/Read to confirm specifics).
3. Diff catalog vs audit into a gap list, each gap tagged: `works` / `broken` / `unverified`
   (userland React/Vue/etc. code the reconciler never touches, so likely fine but untested)
   / `needs-host-config-work` (renderer-level gap, e.g. missing react-reconciler flag).
4. `unverified` gaps get the smallest possible smoke test against the real engine (not mocks)
   to promote them to `works`/`broken`. Use `test-driven-development` for anything genuinely broken.
5. A gap that needs a real refactor or a new shared layer (`core/engine`/`core/components`)
   must NOT get silently implemented as partial support. Use `grill-me` with the user first,
   mirroring `<adapters_reach_full_feature_parity>`'s ban on shipping a reduced surface.
6. Update the status table below and the framework's catalog file every session.

## Status

| Framework | Catalog built | Adapter audited | Gap list | Fixes landed |
|---|---|---|---|---|
| React | done (2026-09-25) | done (2026-09-25) | done, see `references/react-adapter-gap-list.md` | closed. 2 doc fixes, 2 new regression tests, `ConcurrentRoot` switch kept (harmless, correctness-of-intent). Scheduling turned out to already work (the original "broken" claim was unverified inference). The one real gap, Suspense-for-Image, is upstream RN's own limitation too (not a parity item), left as a documented, accepted limitation |
| Vue | done (2026-09-25) | done (2026-09-25) | closed, see `references/vue-adapter-gap-list.md` | Full guide surface confirmed working or built: Teleport/Suspense/KeepAlive/v-show/v-model/withModifiers/withKeys/useCssModule/useTemplateRef/useId/useModel/onActivated/onDeactivated/resolveDynamicComponent/v-memo/custom directives all verified; built `Transition`/`TransitionGroup` (opacity fade over Animated, no move-animation, no named effects); `useCssVars` deferred (no runtime-reactive `var()` foundation, dismissed as low value) |
| Solid | no | no | pending | none |
| Svelte | done (2026-09-25) | done (2026-09-25) | closed, see `references/svelte-adapter-gap-list.md` | Built `getComputedStyle` (bare global), `Element.animate()` (keyframe replay), `CustomEvent` polyfill, `ShimElement.getBoundingClientRect()` + a new optional synchronous engine export (`core/engine`'s `getBoundingClientRect`, threaded through `ITreeHost`/`INativeEngineBindings`). Fixes `transition:`/`in:`/`out:` (real opacity fade, verified non-vacuously) and `createEventDispatcher` (real parent-listener test) outright. `animate:flip`/`crossfade` no longer crash but need the native C++ binding (RN's own `react::dom::getBoundingClientRect` confirmed to exist, mirrors `measureInWindow`) before real device geometry works - tracked as a named follow-up, not silently dropped. Full monorepo: 6693 tests, `tsc -b` clean |
| Angular | no | no | pending | none |

Next ralph-loop iteration: read this table first, resume the first framework that is not
fully done rather than restarting React from scratch.
