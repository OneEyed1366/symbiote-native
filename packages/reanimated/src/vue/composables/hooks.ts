import { onScopeDispose } from '@vue/runtime-core';
import { createSetupOnceHooks } from '../../core/setup-once';
import { followInScope } from '../track';

// Vue's setup runs once, so every composable is the shared one with Vue's scope and `watch`
export const hooks = createSetupOnceHooks({
  onDispose: onScopeDispose,
  followInScope,
});
