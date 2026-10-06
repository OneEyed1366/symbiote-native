// `StyleSheet.setStyleAttributePreprocessor` registry, read by `flatten` and by the style publish

import { flattenStyle } from './style';

type IStylePreprocessor = (value: unknown) => unknown;

const stylePreprocessors = new Map<string, IStylePreprocessor>();

// Replacing a function with a different one warns like RN, the same function stays silent
export function setStylePreprocessor(
  property: string,
  process: IStylePreprocessor,
): void {
  const previous = stylePreprocessors.get(property);
  if (previous !== undefined && previous !== process) {
    console.warn(`Overwriting ${property} style attribute preprocessor`);
  }
  stylePreprocessors.set(property, process);
}

// Only the keys the style carries are rewritten, the rest comes back without a copy
export function preprocessFlatStyle(
  flat: Record<string, unknown>,
): Record<string, unknown> {
  const present = Array.from(stylePreprocessors).filter(([property]) =>
    Object.hasOwn(flat, property),
  );
  if (present.length === 0) return flat;
  const result = { ...flat };
  for (const [property, process] of present) {
    result[property] = process(result[property]);
  }
  return result;
}

// What a node publishes in place of its `[class, explicit]` pair once any preprocessor exists
export function preprocessPublishedStyle(published: unknown): unknown {
  if (stylePreprocessors.size === 0) return published;
  return [preprocessFlatStyle(flattenStyle(published))];
}
