// The one place a shim node is bound EAGERLY instead of lazily (svelte-adapter-dom-shim skill
// §9, §10). Every other shim node only gets its ISymbioteNode on first insertion under a live
// parent; the root has no parent to inherit liveness from — it IS the top of the live tree, so
// it must be live from the moment it exists. This is what Svelte's `mount(Component, { target })`
// receives as `target`.
//
// `makeLive` already does exactly the right thing generically (create the engine node, replay
// accumulated state, recurse into children) — it just never appends the result anywhere, since
// normally an ancestor's `insertOne` does that. For the root there is no ancestor shim node;
// the surface plays that role, so this file makes the one `surface.appendChild` call directly.

import type { SymbioteSurface } from '@symbiote-native/engine';
import { ShimElement } from './dom-shim';

const ROOT_INTRINSIC = 'symbiote-view';

// Unlike Vue/React, whose app root mounts directly onto the surface (its own flex:1
// class/style reaches the engine's synthetic flex:1 AppContainer with nothing in between),
// Svelte's compiled output needs a real DOM-like `target` to call appendChild on — this
// wrapper. Without flex:1 here, a flex:1-styled app root nested one level inside it has no
// resolved parent height to grow into and the whole tree collapses to 0x0: every prop still
// commits correctly (nothing throws), so this only shows up as a blank, untappable screen.
const ROOT_WRAPPER_STYLE = { flex: 1 };

export function createRootShimElement(surface: SymbioteSurface): ShimElement {
  const root = new ShimElement(ROOT_INTRINSIC);
  root.p = { style: ROOT_WRAPPER_STYLE };
  const engineNode = root.makeLive(surface);
  surface.appendChild(engineNode);
  surface.requestCommit();
  return root;
}
