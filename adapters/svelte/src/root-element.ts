// The mount target: Svelte needs a `target` node to mount into, and the surface is not a node
// It is an engine `view` appended to the surface once, and everything Svelte renders lands under it

import type { ISymbioteNode, SymbioteSurface } from '@symbiote-native/engine';
import { setHostPropBag } from './element-props';
import symbioteRenderer from './symbiote-renderer';

const ROOT_INTRINSIC = 'view';

// Without flex:1 here, a flex:1 app root nested inside has no parent height to grow into
// The tree collapses to 0x0 with nothing thrown, which shows up as a blank untappable screen
const ROOT_WRAPPER_STYLE = { flex: 1 };

export function createRootElement(surface: SymbioteSurface): ISymbioteNode {
  const root = symbioteRenderer.createElement(ROOT_INTRINSIC);
  setHostPropBag(root, { style: ROOT_WRAPPER_STYLE });
  surface.appendChild(root);
  surface.requestCommit();
  return root;
}
