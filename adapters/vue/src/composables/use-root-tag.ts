// The tag of the surface a component is rendered into, the Vue twin of RN's `RootTagContext`:
// `mount` provides it on the app, a composable reads it back in `setup()`

import { inject, type InjectionKey } from '@vue/runtime-core';
import type { IRootTag } from '@symbiote-native/engine';

export const ROOT_TAG_KEY: InjectionKey<IRootTag> = Symbol('symbiote-root-tag');

export function useRootTag(): IRootTag {
  const rootTag = inject(ROOT_TAG_KEY, undefined);
  if (rootTag === undefined) {
    throw new Error('useRootTag() needs a component mounted by mount()');
  }
  return rootTag;
}
