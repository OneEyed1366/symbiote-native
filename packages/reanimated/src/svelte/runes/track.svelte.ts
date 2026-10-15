import { untrack } from 'svelte';
import { followUpdaterIn, type ITrack } from '../../core/follow-reads';
import { onCleanup } from './on-cleanup.svelte';

// The effect runs once to learn what `read` reads, which is not a change. A root of its own, so
// the returned stop can end it whether or not a component stands around it
export const trackReads: ITrack = (read, onChange) => {
  let isFirstRun = true;
  return $effect.root(() => {
    $effect(() => {
      read();
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      untrack(onChange);
    });
  });
};

export const followInScope = followUpdaterIn(trackReads, onCleanup);
