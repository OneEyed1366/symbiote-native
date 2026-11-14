// The iOS look of an ActivityIndicator, from `ActivityIndicator.js` and the C++ rule: a view that
// centers the spinner, and a gray ring that turns while it animates

import type { ICssDeclarations } from './css-values';
import { toLength } from './css-values';
import { CLASS_NAMES } from './reset-sheet';
import type { IDomSpec } from './spec-types';

export type ISpinnerProps = {
  animating?: unknown;
  color?: unknown;
  size?: unknown;
  hidesWhenStopped?: unknown;
};

const DEFAULT_SIZE = 20;
const NAMED_SIZES: Readonly<Record<string, number>> = {
  small: DEFAULT_SIZE,
  large: 36,
};
const GRAY = '#999999';

export function spinnerHostRules(): Partial<IDomSpec> {
  return { css: { 'align-items': 'center', 'justify-content': 'center' } };
}

function sizeOf(size: unknown): number {
  if (typeof size === 'number') return size;
  return (
    (typeof size === 'string' ? NAMED_SIZES[size] : undefined) ?? DEFAULT_SIZE
  );
}

export function spinnerRules(props: ISpinnerProps): Partial<IDomSpec> {
  const box = toLength(sizeOf(props.size));
  const css: ICssDeclarations = {
    width: box,
    height: box,
    'border-color': typeof props.color === 'string' ? props.color : GRAY,
    'border-top-color': 'transparent',
  };
  if (props.animating === false) {
    if (props.hidesWhenStopped === false)
      css['animation-play-state'] = 'paused';
    else css.display = 'none';
  }
  return {
    classNames: [CLASS_NAMES.spinner],
    css,
    attributes: { role: 'progressbar' },
  };
}
