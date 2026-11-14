// A Button's label is styled by the button it sits in, as RN's Button does and the C++ rule
// reproduces: a blue centered text, tinted by the button's `color`, grey while it is disabled

import { isRecord } from '@symbiote-native/engine';
import { cssFromBag } from './css-style';
import type { ICssDeclarations } from './css-values';
import { HIDDEN_DESCENDANTS } from './dom-attributes';
import type { IDomSpec } from './spec-types';

const SYSTEM_BLUE = '#007AFF';
const DISABLED_GREY = '#cdcdcd';
const LABEL_MARGIN = 8;
const LABEL_FONT_SIZE = 18;

// What the label reads off its button, handed over by the host as one derived prop
export type IButtonOwner = { color?: unknown; isDisabled?: boolean };

export type IButtonLabelProps = { buttonOwner?: unknown };

export function buttonLabelCss({
  color,
  isDisabled,
}: IButtonOwner): ICssDeclarations {
  const tint = typeof color === 'string' && color !== '' ? color : SYSTEM_BLUE;
  return cssFromBag({
    textAlign: 'center',
    margin: LABEL_MARGIN,
    color: isDisabled === true ? DISABLED_GREY : tint,
    fontSize: LABEL_FONT_SIZE,
  });
}

// RN's Button reads `ariaLabel || accessibilityLabel`, and an unimportant one hides what it holds
export function foldButtonAccessibility(
  rest: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const out = { ...rest };
  if (out['aria-label'] === '') delete out['aria-label'];
  if (out.importantForAccessibility === 'no') {
    out.importantForAccessibility = HIDDEN_DESCENDANTS;
  }
  return out;
}

export function buttonLabelRules({
  buttonOwner,
}: IButtonLabelProps): Partial<IDomSpec> {
  if (!isRecord(buttonOwner)) return {};
  const { color, isDisabled } = buttonOwner;
  return { css: buttonLabelCss({ color, isDisabled: isDisabled === true }) };
}
