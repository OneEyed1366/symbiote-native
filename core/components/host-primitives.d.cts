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
  /**
   * The primitive's TAG depends on a prop. `TextInput` is the only one: `multiline` selects between
   * two different Fabric views (`symbiote-text-input` / `symbiote-text-input-multiline`), not
   * between two values of one view. A transform prints a static tag, so it resolves the choice only
   * for a literal — and the boundary is IDENTITY, not truthiness: a bare attribute is `true`, an
   * explicit boolean literal is itself, absence is `false`, and everything else refuses (including a
   * truthy non-boolean like `multiline={1}`, which a type-shaped check waves through).
   *
   * ONE selector and ONE alternative, deliberately. Absent means "one tag", so no existing entry
   * changes. Full rationale in `host-primitives.cjs`, which this file must be kept in step with —
   * see the note there.
   */
  intrinsicWhen?: { prop: string; intrinsic: string };
}

export declare const HOST_PRIMITIVES: Readonly<Record<string, IHostPrimitive>>;
export declare const REFUSAL_CATEGORIES: Readonly<Record<string, string>>;
export declare const LOWERING_RUNS_LAST: string;
