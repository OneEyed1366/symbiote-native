// Пропсы `<checkbox>` для Vue, самого компонента нет, элемент это тег
// Базовые поля общие (<prop_types_split_agnostic_vs_per_adapter>), остальное поверхность View
import type { ICheckboxProps as ICoreCheckboxProps } from '@symbiote-native/components';
import type { IViewProps } from './view-props';

export type ICheckboxProps = ICoreCheckboxProps &
  Omit<IViewProps, keyof ICoreCheckboxProps>;
