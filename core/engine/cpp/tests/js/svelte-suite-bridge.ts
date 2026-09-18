// The one seam between `svelte-suite.itest.ts` and the `.svelte` screen it mounts.
//
// A Svelte 5 component owns its `$state` — there is no handle on the mounted instance to write
// through, and props passed to `mount` are not reactive unless they are themselves a `$state`
// proxy. So the screen registers its own setter here as it initialises and the fixture picks it up,
// which is the same shape every other arm uses (a module-level setter captured on first render).

import type { IBenchState } from './bench-suite';

export type ISetBenchState = (next: IBenchState) => void;

let setter: ISetBenchState | undefined;

export function registerSetBenchState(next: ISetBenchState): void {
  setter = next;
}

export function benchStateSetter(): ISetBenchState {
  if (setter === undefined) throw new Error('the screen never initialised');
  return setter;
}
