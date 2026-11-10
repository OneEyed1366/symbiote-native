// A property with variants is `{ default, ':hover': … }`: the compiler writes a state rule as
// `{ ':hover': value }` and the cascade joins it with the base of the same property here
const DEFAULT_KEY = 'default';

type IVariants = Record<string, unknown>;

export function isVariants(value: unknown): value is IVariants {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length > 0 &&
    keys.every(key => key === DEFAULT_KEY || key.startsWith(':'))
  );
}

export function hasVariants(style: object): boolean {
  return Object.values(style).some(isVariants);
}

function asVariants(value: unknown): IVariants {
  if (isVariants(value)) return value;
  return { [DEFAULT_KEY]: value };
}

// `standing` is what an earlier rule left for the property, `value` what the later one says
function mergeValue(standing: unknown, value: unknown): unknown {
  if (isVariants(value)) {
    return standing === undefined
      ? value
      : { ...asVariants(standing), ...value };
  }
  if (isVariants(standing)) return { ...standing, [DEFAULT_KEY]: value };
  return value;
}

export function mergeStyle<S extends object>(standing: S, next: S): S {
  const merged = Object.assign({}, standing);
  for (const [key, value] of Object.entries(next)) {
    Reflect.set(merged, key, mergeValue(Reflect.get(standing, key), value));
  }
  return merged;
}
