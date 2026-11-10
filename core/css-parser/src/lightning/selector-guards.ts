import type { SelectorComponent, Token, TokenOrValue } from 'lightningcss';
import { isRecord } from './value-readers.ts';

// Every `SelectorComponent['type']`, and tsc proves the list stays whole
const SELECTOR_COMPONENT_TYPES: Record<SelectorComponent['type'], true> = {
  combinator: true,
  universal: true,
  namespace: true,
  type: true,
  id: true,
  class: true,
  attribute: true,
  'pseudo-class': true,
  'pseudo-element': true,
  nesting: true,
};

// Rejects a shape lightningcss does not produce instead of trusting any object with a `type`
export function isSelectorComponent(value: unknown): value is SelectorComponent {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    Object.hasOwn(SELECTOR_COMPONENT_TYPES, value.type)
  );
}

function isTokenOrValue(value: unknown): value is TokenOrValue {
  return isRecord(value) && typeof value.type === 'string';
}

/** The token a `custom-function` argument carries, or `null` for any other value */
export function tokenOf(value: unknown): Token | null {
  return isTokenOrValue(value) && value.type === 'token' ? value.value : null;
}
