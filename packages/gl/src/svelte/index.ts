// @symbiote-native/gl/svelte: a GLView that gives a WebGL context to draw into, on a shared core

import type { IGLViewHandle as ICoreGLViewHandle } from '../core';

export { default as GLView } from './gl-view.svelte';
export * from '../core';

// `bind:this` reaches the instance exports only, so the context id is a method here
export type IGLViewHandle = Omit<ICoreGLViewHandle, 'exglCtxId'> & {
  getContextId: () => number | undefined;
};
