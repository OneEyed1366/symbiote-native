// Registry of currently-mounted SymbioteSurface instances. Exists so a future devtools
// inspector can read the retained view tree of every active surface without either side
// wiring anything per-adapter (the whole point — the registry lives once here and every
// adapter gets it for free). A neutral module, like post-commit.ts: surface.ts registers
// on createSurface, commit.ts unregisters on disposeRoot, and neither of those two ever
// imports the other for this purpose (surface.ts already imports commitChildren from
// commit.ts, so the reverse import would cycle).

import type { IRootTag } from './fabric';
import type { SymbioteSurface } from './surface';

const activeSurfaces = new Set<SymbioteSurface>();

export function registerSurface(surface: SymbioteSurface): void {
  activeSurfaces.add(surface);
}

export function unregisterSurface(rootTag: IRootTag): void {
  for (const surface of activeSurfaces) {
    if (surface.rootTag === rootTag) {
      activeSurfaces.delete(surface);
      return;
    }
  }
}

// Snapshot, not the live Set — a caller mutating the returned array must not be able to
// mutate engine-internal state.
export function getActiveSurfaces(): readonly SymbioteSurface[] {
  return [...activeSurfaces];
}
