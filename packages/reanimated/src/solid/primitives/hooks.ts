import { onCleanup } from 'solid-js';
import { createSetupOnceHooks } from '../../core/setup-once';
import { followInScope } from './track';

// Solid's setup runs once, so every primitive is the shared one with Solid's owner and computation
export const hooks = createSetupOnceHooks({
  onDispose: onCleanup,
  followInScope,
});
