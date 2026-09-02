// The runtime half of state-style lowering: splits an authored `style` into its resting and pressed
// halves. Referenced by the code every lowering transform EMITS, never by app code.
//
// SHARED for the same reason `HOST_PRIMITIVES` and `specializeStateStyle` are — two adapters had
// written byte-identical copies within an hour of each other, which is the duplication
// `<adapters_stay_thin>` exists to stop. Each adapter re-exports it from its own `./state-style`
// subpath so the emitted import specifier stays inside the package the app already depends on.
//
// WHY A HELPER EXISTS BESIDE THE INLINE GUARD, since a transform may emit either. Building the pair
// needs the authored `style` expression, and the two emissions are NOT equivalent:
//
//   inline    typeof e === 'function' ? e({pressed:false}) : e   prints `e` on both props, so a
//             `getStyle()` runs twice and a `flag ? a : b` can take DIFFERENT branches
//   helper    resolveStateStyle(e)                               prints `e` once and calls its
//             RESULT twice
//
// The rule the two must satisfy is `REFUSAL_CATEGORIES.emitStyleExpressionOnce`, and it is about
// the output rather than the input: **an expression capable of DOING WORK is printed once.** A bare
// name or a non-computed dotted path is a read, not work, so the inline form is legitimate there —
// and it matters, because a helper returns one object, which a framework must spread, and a spread
// costs the element its patch flag (Vue measured `12 /* STYLE, PROPS */` becoming
// `16 /* FULL_PROPS */` plus a `mergeProps` per render on the hottest element in the tree).
//
// So the VERDICT is identical across adapters — every shape lowers — and only the cost differs,
// exactly as compile-time substitution differs between a JSX path and an SFC one. The verdicts are
// what `@symbiote-native/components/lowering-fixtures` pins.
//
// THE CONTRACT THIS IMPOSES ON APP CODE: a style callback must be PURE in `pressed`. Its result is
// invoked twice under every emission, so a side-effecting body is observable now.

export interface IPressStateArgument {
  pressed: boolean;
}

export interface IResolvedStateStyle {
  style: unknown;
  activeStyle: unknown;
}

function isStyleCallback(
  value: unknown,
): value is (state: IPressStateArgument) => unknown {
  return typeof value === 'function';
}

/**
 * Splits an authored `style` into its resting and pressed halves, reading the value once.
 *
 * A non-callback passes through untouched with no active variant, which the engine reads as "leave
 * slot 1 alone" — that is what makes one emission safe for an expression whose value cannot be
 * known at compile time.
 */
export function resolveStateStyle(value: unknown): IResolvedStateStyle {
  if (!isStyleCallback(value)) return { style: value, activeStyle: undefined };
  return {
    style: value({ pressed: false }),
    activeStyle: value({ pressed: true }),
  };
}
