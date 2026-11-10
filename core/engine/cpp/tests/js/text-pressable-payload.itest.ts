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

  // `PressableText` шлёт `isPressable` и `isHighlighted` сразу, а не после первого нажатия
  it('marks a pressable text as pressable and not highlighted', () => {
    const payload = textPayload({ onPress: () => {} });

    expect(payload?.isPressable).toBe(true);
    expect(payload?.isHighlighted).toBe(false);
  });

  it('sends neither for a text that is not pressable or is disabled', () => {
    for (const props of [{}, { onPress: () => {}, disabled: true }]) {
      const payload = textPayload(props);
      expect(payload?.isPressable).toBe(undefined);
      expect(payload?.isHighlighted).toBe(undefined);
    }
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

  // Авторский `role` уходит нативу как есть, ссылочная роль не подставляется
  it('keeps an authored role prop', () => {
    const payload = textPayload({ onPress: () => {}, role: 'button' });

    expect(payload?.role).toBe('button');
    expect(payload?.accessibilityRole).toBe(undefined);
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
