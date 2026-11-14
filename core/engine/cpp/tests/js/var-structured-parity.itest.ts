// A shadow, a filter or a transform must commit the same payload whether its text came through
// `var()` (parsed in C++) or was written plain (parsed by RN's JS processors at write time)

import {
  clearGlobalStyles,
  committedPayloadOf,
  createElement,
  createSurface,
  registerRootVariables,
  setProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;
const VARIABLE = '--text';

// Left out: anything with a colour, since RN's JS colour path needs `Platform`, which this host
// lacks, and a transform step that only a development build refuses (the C++ path always does)
const CORPUS: Record<string, readonly string[]> = {
  filter: [
    'brightness(0.5) hue-rotate(90deg)',
    'blur(4px) opacity(50%) grayscale(1)',
    'hue-rotate(0)',
    'hue-rotate(1rad)',
    'blur(2em)',
    'blur(-1px)',
    'opacity(1) hue-rotate(45)',
    'drop-shadow(1px)',
    'sparkle(1)',
  ],
  transform: [
    'rotate(6deg) translateX(10px) scale(1.5)',
    'translate(10px, 20px)',
    'translate(1px)',
    'translate3d(5px, 10px, 0)',
    'translateX(10%)',
    'perspective(100px)',
    'matrix(1, 0, 0, 0, 1, 0, 0, 0, 1)',
    'translateX()',
  ],
};

// The payload keeps its objects in a key order of its own, so a comparison sorts the keys first
function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, withSortedKeys(entry)]),
  );
}

function committedKey(key: string, value: string): unknown {
  const surface = createSurface(ROOT_TAG);
  const node = createElement('RCTView', false);
  setProp(node, 'style', { [key]: value });
  surface.appendChild(node);
  surface.commit();
  mounted();
  return withSortedKeys(committedPayloadOf(node)?.[key]);
}

describe('a structured style through var() against the same text written plain', () => {
  for (const [key, texts] of Object.entries(CORPUS)) {
    for (const text of texts) {
      it(`${key}: ${text}`, () => {
        clearGlobalStyles();
        const plain = committedKey(key, text);
        registerRootVariables([{ name: VARIABLE, value: text }]);
        expect(committedKey(key, `var(${VARIABLE})`)).toEqual(plain);
      });
    }
  }
});

report();
