// Solid's `spread` walks only the CURRENT key set (`for (const prop in props)` in its
// spreadExpression) and has no removal pass, so a key that VANISHES between runs keeps its last
// value on the native view forever. Not hypothetical: resolveAccessibilityProps has two branches
// with different key sets — it returns the input untouched while no aria-* alias holds a value,
// and `{...props, role: undefined, …every alias blanked, accessibilityLabel: <folded>}` once one
// does (hasAnyAriaKey tests the VALUE, not key presence). So a caller whose `aria-label` signal
// goes undefined drops the `accessibilityLabel` KEY, and a screen reader keeps announcing a label
// the app already removed. React and Vue never meet this: they hand their reconciler a whole new
// prop object, and the engine's diffProps sends a vanished key down as literal null
// (symbiote-engine-core §8). Widening the bag to every key ever seen restores that — a vanished
// key arrives as `undefined`, which routeProp treats as a delete, and `spread` keeps doing all
// the actual diffing. Never hand-roll that diff instead.
//
// Lives here rather than beside either caller because BOTH reach for it: descriptorToSolid wraps
// a render fn's Descriptor props, and the host primitives (View, Text) wrap their own
// resolveAccessibilityProps output — the same function, the same two-branch key set. Any future
// Solid component that folds props through a whole-object transform belongs on this too.

export function withStableKeys(
  props: () => Record<string, unknown>,
): () => Record<string, unknown> {
  const seen = new Set<string>();
  return () => {
    const next = props();
    const widened: Record<string, unknown> = {};
    for (const key of seen) widened[key] = undefined;
    for (const key of Object.keys(next)) {
      seen.add(key);
      widened[key] = next[key];
    }
    return widened;
  };
}
