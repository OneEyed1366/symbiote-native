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
// a render fn's Descriptor props, and a component that spreads a folded bag onto a bare `<view>`
// (Pressable, KeyboardAvoidingView) wraps its own — the same function, the same two-branch key
// set. This is the one capability a bare tag does NOT inherit from the wrappers that used to own
// it, so any Solid component folding props through a whole-object transform belongs on it too.

export function withStableKeys<TProps extends object>(
  props: () => TProps,
): () => Record<string, unknown> {
  const seen = new Set<string>();
  return () => {
    const next = props();
    const widened: Record<string, unknown> = {};
    for (const key of seen) widened[key] = undefined;
    for (const [key, value] of Object.entries(next)) {
      seen.add(key);
      widened[key] = value;
    }
    return widened;
  };
}
