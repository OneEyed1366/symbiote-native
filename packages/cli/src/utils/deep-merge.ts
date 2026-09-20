import { isJsonObject, type IJsonObject, type IJsonValue } from './json.js';

// Ported from create-vue's utils/deepMerge.ts — same array-dedupe + recursive-object-merge
// semantics, needed once layers (base + navigation + expo-modules) can stack onto one
// package.json. See packages/cli/README.md's "Design decisions" section.
function mergeArrayWithDedupe(a: IJsonValue[], b: IJsonValue[]): IJsonValue[] {
  return Array.from(new Set([...a, ...b]));
}

export function deepMerge(
  target: IJsonObject,
  source: IJsonObject,
): IJsonObject {
  for (const key of Object.keys(source)) {
    const oldVal = target[key];
    const newVal = source[key];

    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      target[key] = mergeArrayWithDedupe(oldVal, newVal);
    } else if (isJsonObject(oldVal) && isJsonObject(newVal)) {
      target[key] = deepMerge(oldVal, newVal);
    } else {
      target[key] = newVal;
    }
  }

  return target;
}
