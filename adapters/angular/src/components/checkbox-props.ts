// Пропсы `<checkbox>` для Angular, компонента нет, тег матчит `CheckboxElement`
// Убраны a11y-колбэки (в Angular это outputs) и `onChange`, который upstream тоже никогда не зовёт
import type { ICheckboxProps as ICoreCheckboxProps } from '@symbiote-native/components';

export type ICheckboxProps = Omit<
  ICoreCheckboxProps,
  | 'onChange'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;
