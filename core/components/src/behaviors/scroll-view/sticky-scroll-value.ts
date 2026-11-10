// The scroll value every sticky header of a ScrollView interpolates. RN seeds it with
// `contentOffset.y` and carries `contentInset.top` as its offset (`ScrollView.js:742-745`), so the
// pin follows the scroll position past the inset

import {
  AnimatedValue,
  isRecord,
  propOf,
  type ISymbioteNode,
} from '@symbiote-native/engine';

export type IStickyScrollValue = {
  scrollValue: AnimatedValue;
  // `contentInset.top` as last written to the value's offset
  insetTop: number;
};

function numberOrZero(value: unknown, key: string): number {
  if (!isRecord(value)) return 0;
  const found = value[key];
  return typeof found === 'number' ? found : 0;
}

function insetTopOf(owner: ISymbioteNode): number {
  return numberOrZero(propOf(owner, 'contentInset'), 'top');
}

export function createStickyScrollValue(
  owner: ISymbioteNode,
): IStickyScrollValue {
  const scrollValue = new AnimatedValue(
    numberOrZero(propOf(owner, 'contentOffset'), 'y'),
  );
  const insetTop = insetTopOf(owner);
  scrollValue.setOffset(insetTop);
  return { scrollValue, insetTop };
}

// Run after every owner commit: the inset may have changed and nothing else reports it
export function syncInsetOffset(
  owner: ISymbioteNode,
  current: IStickyScrollValue,
): void {
  const top = insetTopOf(owner);
  if (top === current.insetTop) return;
  current.insetTop = top;
  current.scrollValue.setOffset(top);
}
