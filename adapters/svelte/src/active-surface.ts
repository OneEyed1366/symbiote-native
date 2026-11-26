// The surfaces a mutation may commit to
// The renderer is a module singleton that compiled components import, so it has no surface argument
// A commit request is microtask-coalesced, and one mounted app is the usual case

import type { SymbioteSurface } from '@symbiote-native/engine';

export const liveSurfaces = new Set<SymbioteSurface>();

export function commitLiveSurfaces(): void {
  for (const surface of liveSurfaces) surface.requestCommit();
}
