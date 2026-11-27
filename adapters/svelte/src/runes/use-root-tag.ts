// RN's `RootTagContext` for Svelte: `mount` puts the surface tag in context, 0 stays the default

import { getContext } from 'svelte';
import type { IRootTag } from '@symbiote-native/engine';

const NO_SURFACE = 0;

export const ROOT_TAG_KEY = Symbol('symbiote.rootTag');

// `mount` also puts the surface itself in context, for code that must commit a raw engine node
export const SURFACE_KEY = Symbol('symbiote.surface');

export function useRootTag(): IRootTag {
  return getContext<IRootTag | undefined>(ROOT_TAG_KEY) ?? NO_SURFACE;
}
