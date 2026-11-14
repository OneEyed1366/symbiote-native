// Plain props of a Fabric payload bag as DOM attributes, one writer per prop. A prop nobody here
// writes is reported, so a dropped prop does not go unseen

import { isRecord } from '@symbiote-native/engine';
import { isStyleKey } from './css-style';

export type IAttributes = Record<string, string>;

type IAttributeWriter = (value: unknown) => IAttributes | undefined;

const ARIA_PREFIX = 'aria-';
export const HIDDEN_DESCENDANTS = 'no-hide-descendants';
const NO_LIVE_REGION = 'none';

const named =
  (attribute: string): IAttributeWriter =>
  value => ({ [attribute]: String(value) });

// Roles the web spells differently from RN
const ROLE_NAMES: Readonly<Record<string, string>> = {
  header: 'heading',
  image: 'img',
  imagebutton: 'button',
  adjustable: 'slider',
  none: 'presentation',
};

const roleWriter: IAttributeWriter = value => {
  const role = String(value);
  return { role: ROLE_NAMES[role] ?? role };
};

// Each key of a record prop is its own aria attribute under a shared prefix
const spreadOver =
  (prefix: string, keys: readonly string[]): IAttributeWriter =>
  value => {
    if (!isRecord(value)) return undefined;
    const out: IAttributes = {};
    for (const key of keys) {
      if (value[key] !== undefined) out[`${prefix}${key}`] = String(value[key]);
    }
    return out;
  };

const hiddenWhen =
  (isHidden: (value: unknown) => boolean): IAttributeWriter =>
  value => {
    const out: IAttributes = {};
    if (isHidden(value)) out['aria-hidden'] = 'true';
    return out;
  };

const liveRegionWriter: IAttributeWriter = value => ({
  'aria-live': value === NO_LIVE_REGION ? 'off' : String(value),
});

const focusableWriter: IAttributeWriter = value => ({
  tabindex: value === true ? '0' : '-1',
});

const WRITERS = new Map<string, IAttributeWriter>([
  ['testID', named('data-testid')],
  ['nativeID', named('id')],
  ['accessibilityLabel', named('aria-label')],
  ['accessibilityHint', named('aria-description')],
  ['accessibilityRole', roleWriter],
  ['role', roleWriter],
  [
    'accessibilityState',
    spreadOver(ARIA_PREFIX, [
      'disabled',
      'selected',
      'checked',
      'busy',
      'expanded',
    ]),
  ],
  [
    'accessibilityValue',
    spreadOver(`${ARIA_PREFIX}value`, ['min', 'max', 'now', 'text']),
  ],
  ['accessibilityElementsHidden', hiddenWhen(value => value === true)],
  [
    'importantForAccessibility',
    hiddenWhen(value => value === HIDDEN_DESCENDANTS),
  ],
  ['accessibilityLiveRegion', liveRegionWriter],
  ['focusable', focusableWriter],
]);

export function attributesFromBag(
  bag: Readonly<Record<string, unknown>>,
  onSkipped?: (key: string) => void,
): IAttributes {
  const out: IAttributes = {};
  // An aria alias is written last, so it beats the canonical prop that spells the same fact
  const keys = Object.keys(bag).sort(
    (first, second) =>
      Number(first.startsWith(ARIA_PREFIX)) -
      Number(second.startsWith(ARIA_PREFIX)),
  );
  for (const key of keys) {
    if (isStyleKey(key)) continue;
    const written = key.startsWith(ARIA_PREFIX)
      ? { [key]: String(bag[key]) }
      : WRITERS.get(key)?.(bag[key]);
    if (written === undefined) onSkipped?.(key);
    else Object.assign(out, written);
  }
  return out;
}
