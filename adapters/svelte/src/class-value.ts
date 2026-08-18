// clsx-shaped `class` values, normalized to a class string at this adapter's bag boundary.
//
// WHY THIS IS THE ADAPTER'S JOB. `class={{ active: isOn }}` and `class={['card', isOn &&
// 'card-on']}` are idiomatic Svelte, but Svelte only normalizes them on the ELEMENT path:
// `set_class` runs the value through `clsx()` + `to_class()`
// (svelte/src/internal/shared/attributes.js). A COMPONENT prop gets no such treatment — it is
// handed over verbatim. App code here never authors a host element (it composes View/Text/… from
// @symbiote-native/svelte, skill §7), so every class value in this adapter arrives as a component
// prop and the normalization Svelte would have done is ours to do.
//
// WHY NOT WIDEN THE ENGINE'S resolveClassName INSTEAD. There, a plain object means an
// ALREADY-RESOLVED STYLE and is returned untouched. That is load-bearing for the other three
// adapters — React only ever passes a string, and Vue's own `normalizeClass` has already
// flattened `:class="{ active: x }"` into a string before patchProp is reached — so teaching
// resolveClassName to read an object as a class map would silently change their behaviour.
//
// THE DISAMBIGUATION RULE, and why this one: `{ color: 'red' }` is a resolved style and
// `{ active: true }` is a clsx map, and the two shapes are only told apart by their VALUES.
//   every own value is boolean / null / undefined  ->  clsx map
//   anything else (including an empty object)      ->  resolved style, passed through untouched
// A style object's values are colours, lengths and numbers — never booleans — while a clsx map
// is written as `{ name: <condition> }`, and a condition idiomatically evaluates to a boolean.
// The rule is also expressible in the type below (IClassMap's value type IS the runtime check),
// so `{ card: someString }` — the one shape that would silently take the style branch — is a
// compile error at the call site rather than a surprise at runtime. An empty object is
// deliberately NOT treated as a clsx map: both readings contribute no style, so the cheaper,
// non-allocating branch is the right one.
import {
  isClassNameValue,
  resolveClassName,
  type IClassNameValue,
} from '@symbiote-native/engine';

// A clsx map: class name -> whether it applies.
export type IClassMap = Readonly<Record<string, boolean | null | undefined>>;

// One entry of a clsx array. `IClassNameValue` already covers a bare string, a resolved style
// object, and the null/undefined hole a `cond && 'name'` expression leaves behind; `false` is
// the other half of that expression.
export type IClassEntry = IClassNameValue | IClassMap | false;

export type ISvelteClassValue =
  IClassEntry | ReadonlyArray<IClassEntry | ReadonlyArray<IClassEntry>>;

// Returns a class STRING when the value is clsx-shaped, and the value UNTOUCHED otherwise, so
// everything the engine already resolved correctly keeps taking the exact path it took before.
export function normalizeSvelteClass(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const parts: string[] = [];
  return collectClsxParts(value, parts) ? parts.join(CLASS_SEPARATOR) : value;
}

const CLASS_SEPARATOR = ' ';

// For the handful of components that resolve a class to a style THEMSELVES rather than handing
// it to the host bag — ScrollView and VirtualizedList split the resolved class into layout vs.
// visual halves before they know which host tag gets which — so a clsx map reaches the registry
// there too instead of falling into resolveClassName's "already a style" branch.
export function resolveSvelteClass(
  value: unknown,
): ReturnType<typeof resolveClassName> {
  const normalized = normalizeSvelteClass(value);
  return resolveClassName(
    isClassNameValue(normalized) ? normalized : undefined,
  );
}

// Mirrors clsx's own `toVal` (node_modules/clsx/dist/clsx.js), which is what Svelte's `clsx()`
// wrapper delegates to for any object value: a string or number contributes itself, an array
// recurses over its entries dropping the falsy ones, an object contributes every key whose value
// is truthy. Returns false the moment it meets a plain object that is not a clsx map — that
// makes the whole value non-clsx, so the caller hands it on unchanged.
function collectClsxParts(value: unknown, parts: string[]): boolean {
  if (value === null || value === undefined || typeof value === 'boolean')
    return true;
  if (typeof value === 'string' || typeof value === 'number') {
    if (value !== '' && value !== 0) parts.push(String(value));
    return true;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!collectClsxParts(entry, parts)) return false;
    }
    return true;
  }
  if (typeof value !== 'object') return false;
  const entries = Object.entries(value);
  if (!isClassMapEntries(entries)) return false;
  for (const [name, applies] of entries) {
    if (applies === true) parts.push(name);
  }
  return true;
}

function isClassMapEntries(entries: Array<[string, unknown]>): boolean {
  if (entries.length === 0) return false;
  return entries.every(
    ([, applies]) =>
      typeof applies === 'boolean' || applies === null || applies === undefined,
  );
}
