// The public instance a host ref hands back (RN's `ReactFabricHostComponent`): `measure`,
// `setNativeProps`, `focus` and the rest of the imperative API that libraries reach for
// The six methods live on the shared `SymbioteNode` prototype, so `toPublicInstance` is identity

// The function and the type stay as the seam every adapter names: `getPublicInstance` in React,
// `createElement` in Vue, `Renderer2` in Angular and the renderer in Svelte

import type { ISymbioteNode } from '../node';

export type IHostInstance = ISymbioteNode;

export function toPublicInstance(node: ISymbioteNode): IHostInstance {
  return node;
}
