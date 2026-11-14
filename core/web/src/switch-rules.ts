// The iOS look of a Switch: a pill whose color says on or off, with a thumb a class draws.
// Colors follow the props of RN's Switch, and a disabled one is half faded

import { isRecord } from '@symbiote-native/engine';
import type { ICssDeclarations } from './css-values';
import { CLASS_NAMES } from './reset-sheet';
import type { IDomSpec } from './spec-types';

export type ISwitchProps = {
  value?: unknown;
  disabled?: unknown;
  trackColor?: unknown;
  thumbColor?: unknown;
  ios_backgroundColor?: unknown;
};

const ON_COLOR = '#34C759';
const OFF_COLOR = '#E9E9EA';
const DISABLED_OPACITY = '0.5';

const colorOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

function trackOf(props: ISwitchProps, isOn: boolean): string {
  const track = isRecord(props.trackColor) ? props.trackColor : {};
  if (isOn) return colorOf(track.true) ?? ON_COLOR;
  return (
    colorOf(props.ios_backgroundColor) ?? colorOf(track.false) ?? OFF_COLOR
  );
}

export function switchRules(props: ISwitchProps): Partial<IDomSpec> {
  const isOn = props.value === true;
  const isDisabled = props.disabled === true;
  const thumb = colorOf(props.thumbColor);
  const css: ICssDeclarations = { 'background-color': trackOf(props, isOn) };
  if (thumb !== undefined) css['--sn-switch-thumb'] = thumb;
  if (isDisabled) css.opacity = DISABLED_OPACITY;
  return {
    classNames: [CLASS_NAMES.switch],
    css,
    attributes: {
      role: 'switch',
      'aria-checked': String(isOn),
      ...(isDisabled ? { 'aria-disabled': 'true' } : { tabindex: '0' }),
    },
  };
}
