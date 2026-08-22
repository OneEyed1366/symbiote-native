// The Vue adapter's portal — Vue's OWN `<Teleport>`, not a parallel API. Teleport lives in
// @vue/runtime-core, not @vue/runtime-dom, and resolves its target through the RendererOptions we
// already supply: `resolveTarget` only consults `querySelector` for the STRING form of `to`, and
// returns an object target untouched. So stock Teleport drives this renderer as-is — target
// change, unmount, disabled, call-site provide/inject and reactive updates all measured working
// over the engine (create-portal.test.ts). This module adds exactly one thing on top: a runtime
// guard on `to`.
//
// Why the guard: `to` is untyped at the template boundary, and a wrong value (a CSS selector
// copied from web code, a forgotten `.value` on a ref, a plain object) would otherwise sink into
// insert/remove deep in the engine and corrupt the retained tree silently. Vue's own dev warning
// for the string form only fires in a dev build and still returns null, which paints nothing.
//
// Scope — same-surface targets only, the same PERMANENT boundary as React's createPortal
// (adapters/react/src/create-portal/index.ts): a portal MOVES host nodes, and only the surface
// that owns them ever commits them. Content whose target lives in a second, independently
// mount()ed surface needs createTunnel instead, which copies rather than moves.

import { defineComponent, h, Teleport as VueTeleport } from '@vue/runtime-core';
import {
  isSymbioteNode,
  SymbioteSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';

/** Anything already mounted in THIS surface: a host-node ref, or the surface root itself. */
export type ITeleportTarget = ISymbioteNode | SymbioteSurface;

export function isTeleportTarget(target: unknown): target is ITeleportTarget {
  return target instanceof SymbioteSurface || isSymbioteNode(target);
}

export const Teleport = defineComponent({
  name: 'Teleport',
  inheritAttrs: false,
  props: {
    to: { type: null, default: null },
    disabled: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    return () => {
      const { to } = props;
      if (typeof to === 'string') {
        throw new Error(
          `Teleport target must be a host node ref, not a CSS-selector string ("${to}") — symbiote has no querySelector. Pass a ref to an already-rendered element instead (e.g. <View ref="overlayHost" />, then :to="overlayHost").`,
        );
      }
      if (to != null && !isTeleportTarget(to)) {
        throw new Error(
          'Teleport target is not a real host node — did you forget `.value` on a ref, or pass something symbiote never rendered?',
        );
      }
      return h(VueTeleport, { to, disabled: props.disabled }, slots);
    };
  },
});
