// Нажимаемый `<Text>` против `Text.js:152-163`: без своей роли он объявляет себя ссылкой
// Платформо-независимо, Android-половину `accessible` держит `android-rules.android.itest.ts`

import {
  appendChild,
  committedPayloadOf,
  createElement,
  createRawText,
  createSurface,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

// Через `routeProp`, чтобы обработчик нажатия пошёл по пути слушателей, а не лёг в bag
function textPayload(
  props: Record<string, unknown>,
): Readonly<Record<string, unknown>> | undefined {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement('RCTText', true, 'text');
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();
  return committedPayloadOf(node);
}

describe('what a pressable text sends native', () => {
  // `Text.js:157-160`: нажимаемый текст без роли это ссылка для вспомогательных технологий
  it('gives a pressable text the link role', () => {
    expect(textPayload({ onPress: () => {} })?.accessibilityRole).toBe('link');
    expect(textPayload({ onLongPress: () => {} })?.accessibilityRole).toBe(
      'link',
    );
    expect(
      textPayload({ onStartShouldSetResponder: () => true })?.accessibilityRole,
    ).toBe('link');
  });

  // Без нажатия роли нет, у отключённого и у текста с авторской ролью остаётся ответ RN
  it('leaves the role alone when not pressable, disabled or already set', () => {
    expect(textPayload({})?.accessibilityRole).toBe(undefined);
    expect(
      textPayload({ onPress: () => {}, disabled: true })?.accessibilityRole,
    ).toBe(undefined);
    expect(
      textPayload({ onPress: () => {}, accessibilityRole: 'button' })
        ?.accessibilityRole,
    ).toBe('button');
  });

  // Авторский `role` тоже побеждает, W3C-имя переводится в роль RN
  it('keeps an authored role prop', () => {
    expect(
      textPayload({ onPress: () => {}, role: 'button' })?.accessibilityRole,
    ).toBe('button');
  });

  // Вложенный `Text` с `onPress` получает роль на своём узле
  it('gives a nested pressable text the link role', () => {
    const surface = createSurface(ROOT_TAG);
    const outer: ISymbioteNode = createElement('RCTText', true, 'text');
    const inner: ISymbioteNode = createElement('RCTText', true, 'text');
    routeProp(inner, 'onPress', () => {});
    appendChild(inner, createRawText('link'));
    appendChild(outer, createRawText('Parent'));
    appendChild(outer, inner);
    surface.appendChild(outer);
    surface.commit();
    mounted();

    expect(committedPayloadOf(inner)?.accessibilityRole).toBe('link');
    expect(committedPayloadOf(outer)?.accessibilityRole).toBe(undefined);
  });
});

report();
