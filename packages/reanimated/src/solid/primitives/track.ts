import { createComputed, createRoot, onCleanup, untrack } from 'solid-js';
import { followUpdaterIn, type ITrack } from '../../core/follow-reads';

// The computation runs once to learn what `read` reads, which is not a change. A root of its own,
// so the returned stop can end it whether or not a component stands around it
export const trackReads: ITrack = (read, onChange) =>
  createRoot(stop => {
    let isFirstRun = true;
    createComputed(() => {
      read();
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      untrack(onChange);
    });
    return stop;
  });

export const followInScope = followUpdaterIn(trackReads, onCleanup);
