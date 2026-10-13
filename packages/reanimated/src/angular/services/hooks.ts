import { isSignal, untracked } from '@angular/core';
import { createSetupOnceHooks } from '../../core/setup-once';
import { followInScope, onDestroy } from './track';

// A signal is a function, which cannot reach the UI runtime, so the value it holds goes instead
function readSignal(candidate: unknown): { value: unknown } | undefined {
  return isSignal(candidate) ? { value: untracked(candidate) } : undefined;
}

// Angular's constructor runs once, so every service function is the shared one with Angular's
// destroy hook and `effect`, and a signal read in an updater is followed like React's state
export const hooks = createSetupOnceHooks({
  onDispose: onDestroy,
  followInScope,
  readAccessor: readSignal,
});
