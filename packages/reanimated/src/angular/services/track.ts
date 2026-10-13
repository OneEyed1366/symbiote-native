import { DestroyRef, effect, inject, untracked } from '@angular/core';
import { followUpdaterIn, type ITrack } from '../../core/follow-reads';

// The effect runs once to learn what `read` reads, which is not a change. It needs the injection
// context of the component that makes the primitive
export const trackReads: ITrack = (read, onChange) => {
  let isFirstRun = true;
  const tracking = effect(() => {
    read();
    if (isFirstRun) {
      isFirstRun = false;
      return;
    }
    untracked(onChange);
  });
  return () => tracking.destroy();
};

export function onDestroy(dispose: () => void): void {
  inject(DestroyRef).onDestroy(dispose);
}

export const followInScope = followUpdaterIn(trackReads, onDestroy);
