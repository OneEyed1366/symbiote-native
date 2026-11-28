// Shared steps of the Svelte leak guards: one tick and one commit at a time, as a device runs

import { collectGarbage, flushTimers } from './harness';

// C++ frees a dropped tree one level per collection, so a reading needs more than its depth
const COLLECTIONS = 8;

export const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

export const collectAll = (): void => {
  for (let pass = 0; pass < COLLECTIONS; pass += 1) collectGarbage();
};

export const advance = async (
  surface: { commit(): void },
  steps: number,
): Promise<void> => {
  if (steps === 0) return;
  await tick();
  surface.commit();
  await advance(surface, steps - 1);
};
