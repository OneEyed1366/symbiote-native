import { createSetupOnceHooks } from '../../core/setup-once';
import { onCleanup } from './on-cleanup.svelte';
import { followInScope } from './track.svelte';

// Svelte's setup runs once, so every rune is the shared one with Svelte's effects
export const hooks = createSetupOnceHooks({
  onDispose: onCleanup,
  followInScope,
});
