// Android-ветка `checkbox`: единственный платформенный литерал, цвет отмеченного бокса
// Запуск: `pnpm run test:android`, на обычной сборке ключи Android-ветки отсутствуют
// Цвет int со знаком, как в `processColor` RN на Android (`| 0x0`), его не выводят из iOS-литерала

import { registerCheckboxBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

registerCheckboxBehavior();

// #009688 и #657786 как знаковые int: 0xff009688 | 0 и 0xff657786 | 0
const ANDROID_TEAL = -16_738_680;
const ANDROID_GRAY = -10_127_482;

function commit(props: Record<string, unknown>) {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement('RCTView', false, 'checkbox');
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();
  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return payload;
}

describe('what a checkbox sends native on Android', () => {
  it('fills and outlines a checked box with the Material teal', () => {
    const payload = commit({ value: true });
    expect(payload.backgroundColor).toBe(ANDROID_TEAL);
    expect(payload.borderColor).toBe(ANDROID_TEAL);
  });

  it('keeps the gray border when unchecked', () => {
    expect(commit({ value: false }).borderColor).toBe(ANDROID_GRAY);
  });
});

report();
