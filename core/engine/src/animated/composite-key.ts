// Ключ из animated-узлов в props, как `createAnimatedPropsMemoHook` у RN (ветка без allowlist)
// Пока ключ тот же, лист не пересобирается, т.к. пересборка отцепляет нативные узлы от вью

import { AnimatedEventBase } from './event-base';
import { AnimatedNode } from './graph';
import { isPlainObject } from './object';
import { flattenStyle } from '../style';

export type ICompositeKey = Readonly<Record<string, unknown>>;

const STYLE_PROP = 'style';

// Массив оставляет узлы и вложенные ключи, остальное `null`, без узлов он весь `null`
function keyForArray(array: readonly unknown[]): unknown[] | null {
  let key: unknown[] | null = null;
  array.forEach((value, index) => {
    const part = componentOf(value);
    if (part === null) return;
    key ??= new Array<unknown>(array.length).fill(null);
    key[index] = part;
  });
  return key;
}

function keyForObject(object: Record<string, unknown>): ICompositeKey | null {
  let key: Record<string, unknown> | null = null;
  for (const name of Object.keys(object)) {
    const part = componentOf(object[name]);
    if (part === null) continue;
    key ??= {};
    key[name] = part;
  }
  return key;
}

// Узел, вложенный массив или объект, который такие узлы содержит, иначе `null`
function componentOf(value: unknown): unknown {
  if (value instanceof AnimatedNode) return value;
  if (Array.isArray(value)) return keyForArray(value);
  if (isPlainObject(value)) return keyForObject(value);
  return null;
}

function partOfProp(name: string, value: unknown): unknown {
  if (name === STYLE_PROP) {
    const flat = flattenStyle(value);
    return isPlainObject(flat) ? keyForObject(flat) : null;
  }
  if (value instanceof AnimatedNode || value instanceof AnimatedEventBase) {
    return value;
  }
  if (Array.isArray(value) || isPlainObject(value)) return value;
  return null;
}

// `style` ищем целиком (он ограничен), остальные массивы и объекты берём как есть, их не обходим
export function createCompositeKeyForProps(
  props: Readonly<Record<string, unknown>>,
): ICompositeKey | null {
  let key: Record<string, unknown> | null = null;
  for (const name of Object.keys(props)) {
    const part = partOfProp(name, props[name]);
    if (part === null) continue;
    key ??= {};
    key[name] = part;
  }
  return key;
}

function areComponentsEqual(prev: unknown, next: unknown): boolean {
  if (prev === next) return true;
  if (prev instanceof AnimatedNode) return false;
  if (Array.isArray(prev)) {
    if (!Array.isArray(next) || prev.length !== next.length) return false;
    return prev.every((part, index) => areComponentsEqual(part, next[index]));
  }
  if (isPlainObject(prev)) {
    if (!isPlainObject(next)) return false;
    const names = Object.keys(prev);
    if (names.length !== Object.keys(next).length) return false;
    return names.every(
      name =>
        Object.hasOwn(next, name) && areComponentsEqual(prev[name], next[name]),
    );
  }
  return false;
}

export function areCompositeKeysEqual(
  prev: ICompositeKey | null,
  next: ICompositeKey | null,
): boolean {
  if (prev === next) return true;
  if (prev === null || next === null) return false;
  const names = Object.keys(prev);
  if (names.length !== Object.keys(next).length) return false;
  return names.every(name => {
    if (!Object.hasOwn(next, name)) return false;
    // `style` обходится вглубь, остальные компоненты сравниваются по идентичности
    return name === STYLE_PROP
      ? areComponentsEqual(prev[name], next[name])
      : prev[name] === next[name];
  });
}
