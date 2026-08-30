// Types for the lowering spec. Hand-written because the spec itself must stay `.cjs` — its
// consumers are Babel/Metro transforms that run before any TS exists (see the module's header).
// Svelte's preprocessor is TS and reads the same file through these.

export type IFoldOp = { op: 'nullish'; value: unknown } | { op: 'notFalse' };

export interface IHostPrimitive {
  intrinsic: string;
  aliases: Readonly<Record<string, string>>;
  defaults: Readonly<Record<string, IFoldOp>>;
  /**
   * The primitive's own state is observable from the TEMPLATE, so a call site that reads it
   * cannot be lowered — the state resolves below the framework (`:active` in the style registry)
   * and never travels back up. Turns on the `stateInTemplate` and `renderPropChild` refusals.
   * Absent means false; only a stateful primitive ever sets it.
   */
  observesState?: boolean;
}

export declare const HOST_PRIMITIVES: Readonly<Record<string, IHostPrimitive>>;
export declare const REFUSAL_CATEGORIES: Readonly<Record<string, string>>;
export declare const LOWERING_RUNS_LAST: string;
