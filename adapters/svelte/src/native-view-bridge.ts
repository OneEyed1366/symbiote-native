// The subset of this adapter a downstream THIRD-PARTY-native-view package
// (@symbiote-native/slider, packages/slider/src/svelte — see symbiote-third-party-native-view
// skill) needs, both at runtime and in its own tests. Lives OUTSIDE the main barrel
// (./index.ts) for the same reason bootstrap.ts does: `./index.ts` re-exports `./components`,
// whose files are real `.svelte` sources — importing it (even for a single named export)
// forces the whole module graph to load, and Vite/vitest's plain transform (no svelte plugin is
// registered for this repo's tests — see svelte-adapter-dom-shim skill §15, deliberately: unit
// tests compile a `.svelte` file explicitly via `svelte/compiler` instead of a live import
// pipeline) cannot parse `.svelte` syntax, failing with "Failed to parse source for import
// analysis". Every export below resolves through a `.svelte`-free graph (render.ts,
// descriptor-to-svelte.ts, dom-shim/*), confirmed by grepping each for a `.svelte` import.
//
// `mount`/`unmount`: the same pair every framework-agnostic third-party-view package's own test
// needs to bootstrap a surface — the twin of adapters/svelte's OWN internal tests importing them
// from the relative `./render` (unreachable from outside this package; a downstream package must
// go through the export map instead).
//
// `mountDescriptorChildren`/`createDescriptorChildrenSync`: the generic Descriptor -> shim-tree
// bridge (svelte-adapter-dom-shim skill §19), the Svelte twin of Vue's `descriptorToVue` /
// React's `descriptorToReact` (both exported from their own adapter's main barrel — Svelte's
// bridge lives here instead, precisely because its own home module is `.svelte`-free but the
// main barrel that would otherwise re-export it is not). Needed by a third-party-view package to
// mount a Descriptor whose `type` is a raw, non-`symbiote-`-prefixed Fabric name (e.g.
// 'RNCSlider') that cannot be written as a literal Svelte template tag — see
// packages/slider/src/svelte/slider/index.svelte's header for the full reasoning.
export { mount, unmount } from './render';
export {
  mountDescriptorChildren,
  createDescriptorChildrenSync,
} from './descriptor-to-svelte';
export type { IDescriptorChildrenMount } from './descriptor-to-svelte';
export type { ShimElement } from './dom-shim';
