// The RUNTIME half of `HOST_PRIMITIVES` — RN's prop folds applied to a props bag on its way into
// the engine, keyed by intrinsic tag.
//
// Why it exists at all. A tag has no component body to fold its props, and nothing else stands
// between an app and the engine. The gap is not hypothetical: Svelte's `components/button.svelte`
// writes `<text>` directly rather than composing a `Text`, so its title reached Fabric with no
// `ellipsizeMode` and clipped mid-word where every other adapter ellipsised (2026-08-31). Angular
// shipped the identical defect from the identical cause, and both fixed it the same way — a seed in
// the layer every path crosses.
//
// Why it is SHARED rather than one copy per adapter: five copies of one answer is the shape
// `<adapters_stay_thin>` exists to stop. Applying it twice is harmless — every operation here is
// idempotent (`(x ?? 'tail') ?? 'tail'`, `(x !== false) !== false`).
import {
  HOST_PRIMITIVES,
  type IFoldOp,
  type IHostPrimitive,
} from '../host-primitives.cjs';

export type IHostBag = Record<string, unknown>;

// Keyed by INTRINSIC TAG: the spec is keyed by component name (`View`), and by the time a bag
// reaches an adapter's renderer the only name left is `view`.
//
// The spec's `aliases` and `defaults` are OBJECTS, and this runs once per node — 9 002 times on a
// 1 000-row create. `Object.keys()` on each of them per call would allocate two arrays per element
// for data that never changes. Flattened to tuple arrays at module load, so the hot path only
// iterates.
interface IFoldPlan {
  readonly aliases: ReadonlyArray<readonly [string, string]>;
  readonly defaults: ReadonlyArray<readonly [string, IFoldOp]>;
}

const planFor = (primitive: IHostPrimitive): IFoldPlan => ({
  aliases: Object.entries(primitive.aliases),
  defaults: Object.entries(primitive.defaults),
});

// EVERY spelling a primitive commits under: `intrinsicWhen` lets one primitive commit two different
// tags (`TextInput` -> `text-input` / `…-multiline`), and a plan keyed on the base spelling alone
// silently skips the other.
//
// Folding an already-folded bag is a no-op — an alias deletes its source key, so a second pass finds
// nothing to rename — which is what makes the fold safe to reach twice.
function tagsOf(primitive: IHostPrimitive): string[] {
  const alternate = primitive.intrinsicWhen?.intrinsic;
  return alternate === undefined
    ? [primitive.intrinsic]
    : [primitive.intrinsic, alternate];
}

export const FOLD_PLAN_BY_TAG: ReadonlyMap<string, IFoldPlan> = new Map(
  Object.values(HOST_PRIMITIVES).flatMap(primitive => {
    const plan = planFor(primitive);
    return tagsOf(primitive).map((tag): [string, IFoldPlan] => [tag, plan]);
  }),
);

// The runtime twin of a transform's `foldExpression`, which emits these same two operations as
// SOURCE. `notFalse` is RN's own encoding (`allowFontScaling !== false`): an explicit `undefined`
// reads as "not set" and only a literal `false` opts out, which is why it is not a `??`.
function fold(op: IFoldOp, authored: unknown): unknown {
  return op.op === 'notFalse' ? authored !== false : (authored ?? op.value);
}

/**
 * Apply a primitive's aliases and defaults to a bag, copy-on-write.
 *
 * Never mutates the input: the bag belongs to whoever built it, and a framework may hand the same
 * object back on a re-render, so writing into it would leak a fold into the author's own state.
 */
export function foldHostBag(tagName: string, bag: IHostBag): IHostBag {
  const plan = FOLD_PLAN_BY_TAG.get(tagName);
  if (plan === undefined) return bag;

  let next = bag;
  for (const [from, to] of plan.aliases) {
    if (!(from in next)) continue;
    if (next === bag) next = { ...bag };
    // RN gives the alias unconditional priority when both are set (View.js:77-79,
    // `processedProps.nativeID = id`), and the raw key must not survive — no ViewConfig declares
    // `id`, so Fabric would drop it silently.
    next[to] = next[from];
    delete next[from];
  }

  // Seeded whether or not the key was authored: a default that only applies to a key already
  // present is not a default.
  //
  // A bag a transform already folded takes the `continue` on every key and never reaches the copy —
  // which is what keeps the compile-time fold worth having once this one exists. It is no longer
  // the mechanism, but it does keep the hot path allocation-free.
  for (const [key, op] of plan.defaults) {
    const folded = fold(op, next[key]);
    if (key in next && Object.is(next[key], folded)) continue;
    if (next === bag) next = { ...bag };
    next[key] = folded;
  }
  return next;
}
