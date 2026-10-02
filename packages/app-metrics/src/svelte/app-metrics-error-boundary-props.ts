// Split out like adapters/svelte/src/components/view-props.ts: `tsc --build` sees a `.svelte`
// import only through the ambient default-export declaration, never a named type it re-exports

import type { Snippet } from 'svelte';

export type IAppMetricsErrorBoundaryFallbackProps = {
  /** The value the subtree threw, usually an `Error` but any value can be thrown */
  error: unknown;
  /** Clears the caught error and re-renders the default slot from a clean state */
  resetError: () => void;
};

export type IAppMetricsErrorBoundaryProps = {
  /** A snippet receiving `error`/`resetError`, or `null` to capture without rendering */
  fallback: Snippet<[IAppMetricsErrorBoundaryFallbackProps]> | null;
  children: Snippet;
};
