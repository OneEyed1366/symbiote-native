// A local custom directive, shared between two demo call sites: applied declaratively as
// `v-highlight` in ApiPlaygroundScreen.vue's template, and applied imperatively via
// `withDirectives(vnode, [[vHighlight, on]])` in OtherApiDemo.vue's render-function demo — same
// directive object, two authoring forms, proving `withDirectives` reaches the identical hook
// contract a template `v-directive` compiles down to.
//
// Body follows the SAME pattern as the engine's own `vShow` (adapters/vue/src/runtime-helpers.ts,
// see the vue-adapter-directives skill): a directive hook runs outside the renderer's normal
// patchProp path, with no closure over the mounted surface, so it reaches for `setNativeProps`
// (which resolves the node's own root and re-commits it directly) instead of scheduling a bespoke
// commit — and it's wrapped in `whenCommitted` because the FIRST hook firing can land before this
// Vue adapter's own microtask-coalesced commit has assigned a Fabric tag yet (vue-adapter-
// reactivity Gotcha 2), which a bare `setNativeProps` would silently miss on first mount.
import type { ObjectDirective } from 'vue';
import {
  setNativeProps,
  whenCommitted,
  type ISymbioteNode,
} from '@symbiote-native/engine';

const pendingHighlightCommits = new WeakMap<ISymbioteNode, () => void>();

function applyHighlight(el: ISymbioteNode, active: boolean): void {
  pendingHighlightCommits.get(el)?.();
  const cancel = whenCommitted(el, () =>
    setNativeProps(el, {
      style: { backgroundColor: active ? '#f5a623' : '#13243a' },
    }),
  );
  pendingHighlightCommits.set(el, cancel);
}

export const vHighlight: ObjectDirective<ISymbioteNode, boolean> = {
  mounted: (el, { value }) => applyHighlight(el, value),
  updated: (el, { value }) => applyHighlight(el, value),
  unmounted: el => pendingHighlightCommits.get(el)?.(),
};
