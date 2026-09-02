// The public instance a host ref hands back, RN's ReactFabricHostComponent: measure /
// measureInWindow / measureLayout / setNativeProps / focus / blur, the imperative API libraries
// reach through (reanimated, gesture-handler, react-navigation).
//
// EVERY retained node already carries it — the six methods live on the shared node prototype
// (`SymbioteNode` in ../node), so there is nothing left to graft and `toPublicInstance` is the
// identity. It used to Object.assign six fresh closures onto each node; that cost 54 000 closures
// per 1 000-row create and made GC the largest bucket in the profile. The rationale, and why
// React was the one adapter not paying it, is recorded on ISymbioteNode.
//
// The function and the type both stay: they are the seam every adapter names (React's
// getPublicInstance, Vue's nodeOps createElement, Angular's Renderer2, Svelte's dom-shim), and a
// call site saying "hand me the public instance" still reads correctly at a no-op.

import type { ISymbioteNode } from '../node';

export type IHostInstance = ISymbioteNode;

export function toPublicInstance(node: ISymbioteNode): IHostInstance {
  return node;
}
