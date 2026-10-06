// Публичные пропсы `checkbox`, порт `Checkbox.types.ts` из expo-checkbox
import type {
  IColorValue,
  IStyleProp,
  IViewStyle,
  ISymbioteEvent,
} from '@symbiote-native/engine';
import type { IAccessibilityProps, IAriaProps } from '../accessibility-props';

// У upstream `onValueChange(value: boolean)`, здесь `value` лежит полем события, как у Switch
// Компилятор Svelte зовёт on*-атрибут с одним объектом, и голый boolean там ломается
export type ICheckboxChangeEvent = ISymbioteEvent & { value: boolean };

export interface ICheckboxProps extends IAccessibilityProps, IAriaProps {
  value?: boolean;
  disabled?: boolean;
  // Перекрашивает отмеченный бокс и рамку, приоритетнее серого вида disabled
  color?: IColorValue;
  // NOTE: upstream тоже его не вызывает, он деструктурируется и выбрасывается
  onChange?: (event: ISymbioteEvent) => void;
  onValueChange?: (event: ICheckboxChangeEvent) => void;
  style?: IStyleProp<IViewStyle>;
  testID?: string;
}
