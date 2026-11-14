// The look of a checkbox, from `ExpoCheckbox.tsx` through the C++ rule: a bordered box that fills
// when checked, tints with `color` and greys while disabled. Style is composed in upstream's order
// (base, the app's, checked, tint, disabled), so a later step beats the app's own style

import { isRecord } from '@symbiote-native/engine';
import type { IAttributes } from './dom-attributes';
import { cssFromBag, styleKeysOf } from './css-style';
import type { IDomSpec } from './spec-types';

type IBag = Readonly<Record<string, unknown>>;
type IStyle = Record<string, unknown>;

const BOX_SIZE = 20;
const BOX_RADIUS = 2;
const BOX_BORDER = 2;
const GRAY = '#657786';
const DISABLED_GRAY = '#CCD6DD';
const DISABLED_CHECKED_GRAY = '#AAB8C2';
const ENABLED = '#007AFF';

export type ICheckboxProps = { value?: unknown; color?: unknown };

export type ICheckboxMarkProps = { checkboxOwner?: unknown };

const BASE_STYLE: IStyle = {
  height: BOX_SIZE,
  width: BOX_SIZE,
  borderRadius: BOX_RADIUS,
  borderWidth: BOX_BORDER,
  borderColor: GRAY,
};

const MARK_FILL: IStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

function tintStyle(color: unknown, isChecked: boolean): IStyle {
  if (typeof color !== 'string' || color === '') return {};
  return isChecked
    ? { backgroundColor: color, borderColor: color }
    : { borderColor: color };
}

function announcement(bag: IBag): IAttributes {
  const hasAria = Object.hasOwn(bag, 'aria-checked');
  return typeof bag.value === 'boolean' && !hasAria
    ? { 'aria-checked': String(bag.value) }
    : {};
}

export function checkboxRules(bag: IBag): Partial<IDomSpec> {
  const { color, value, ...authored } = bag;
  const isChecked = value === true;
  const isDisabled = bag.disabled === true;
  const style = {
    ...BASE_STYLE,
    ...styleKeysOf(authored),
    ...(isChecked ? { backgroundColor: ENABLED, borderColor: ENABLED } : {}),
    ...tintStyle(color, isChecked),
    ...(isDisabled
      ? { borderColor: DISABLED_GRAY, backgroundColor: 'transparent' }
      : {}),
    ...(isDisabled && isChecked
      ? {
          borderColor: DISABLED_CHECKED_GRAY,
          backgroundColor: DISABLED_CHECKED_GRAY,
        }
      : {}),
  };
  return { css: cssFromBag(style), attributes: announcement(bag) };
}

// The mark is shown while its owner is checked, which only the owner knows
export function checkboxMarkRules({
  checkboxOwner,
}: ICheckboxMarkProps): Partial<IDomSpec> {
  const isChecked = isRecord(checkboxOwner) && checkboxOwner.isChecked === true;
  return {
    css: cssFromBag(isChecked ? MARK_FILL : { ...MARK_FILL, display: 'none' }),
  };
}
