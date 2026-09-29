// Re-exports the existing harness instead of a third copy (packages/sqlite and
// packages/navigation already carry one, not part of either package's public exports)
export {
  createSvelteHarness,
  loadComponent,
  type ISvelteHarness,
} from '../../../sqlite/src/svelte/svelte-compile.test-helper';
