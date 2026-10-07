// Checkbox как поведение engine-ноды, порт `ExpoCheckbox.tsx` из expo-checkbox
// Хост это Pressable, под ним картинка галочки, которую `buildStructure` строит один раз
// Вид (размер, рамка, цвета, display галочки) это правила тега в `SymbioteFabricProps.cpp`

// Регистрируют все пять адаптеров, см. `./pressable` про bare `import './register'`

import {
  appendChild,
  createElement,
  propOf,
  registerHostBehavior,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../component-names';
import type { ICheckboxChangeEvent } from '../view/render-checkbox';
import { CHECKMARK_URI } from './checkbox-checkmark';
import { createPressBehavior, type IPressConfigRefinement } from './pressable';

export const CHECKBOX_TAG = 'checkbox';

// Тег картинки галочки: правило в C++ читает `value` владельца и прячет её при false
export const CHECKBOX_MARK_TAG = 'checkbox-mark';

// Значение владельца меняет вид галочки, поэтому запись `value` помечает её грязной
const SLOT_DERIVED = ['value'];

type IValueChangeHandler = (event: ICheckboxChangeEvent) => void;

function isValueChangeHandler(value: unknown): value is IValueChangeHandler {
  return typeof value === 'function';
}

// Нажатие заменяет любой `onPress` автора, как `onPress={handleChange}` в upstream
// `value` читается в момент нажатия, т.к. замыкание живёт дольше одного рендера
const toggleOnPress: IPressConfigRefinement = (node, config) => ({
  ...config,
  onPress: event => {
    const onValueChange = propOf(node, 'onValueChange');
    if (isValueChangeHandler(onValueChange))
      onValueChange(Object.assign(event, { value: !propOf(node, 'value') }));
  },
});

// Возвращает ноду галочки как slot, т.к. `slotDerived` метит только слот
function buildStructure(node: ISymbioteNode): ISymbioteNode {
  const image = descriptorFor('image');
  const mark = createElement(image.component, image.isText, CHECKBOX_MARK_TAG);
  setProp(mark, 'source', { uri: CHECKMARK_URI });
  appendChild(node, mark);
  return mark;
}

// Идемпотентно: адаптер может импортироваться в бандле несколько раз
export function registerCheckboxBehavior(): void {
  // Тег доходит до C++ только через регистрацию, пустая нужна и галочке
  // `resolvesImageSources` свой у каждого тега: без него `source` уходит объектом, а не массивом
  registerHostBehavior(CHECKBOX_MARK_TAG, {
    resolvesImageSources: true,
    attach() {},
    detach() {},
  });
  registerHostBehavior(CHECKBOX_TAG, {
    ...createPressBehavior(toggleOnPress),
    buildStructure,
    slotDerived: SLOT_DERIVED,
    // Детей у checkbox нет, но без этого они ушли бы внутрь картинки
    slotTakesNoChildren: true,
  });
}
