// Таймеры хоста читаются с `globalThis`, типов `setImmediate` в общем tsconfig нет
export function hostCall(name: string, args: unknown[]): unknown {
  const candidate = Reflect.get(globalThis, name);
  return typeof candidate === 'function'
    ? Reflect.apply(candidate, globalThis, args)
    : undefined;
}
