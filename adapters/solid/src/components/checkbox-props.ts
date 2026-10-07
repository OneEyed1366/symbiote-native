// Пропсы `<checkbox>` для Solid, самого компонента нет, элемент это тег
// Базовые поля общие (<prop_types_split_agnostic_vs_per_adapter>), остальное поверхность View
import type { IClassNameValue } from '@symbiote-native/engine';
import type { ICheckboxProps as ICheckboxBaseProps } from '@symbiote-native/components';
import type { IViewProps } from './view-props';

export type ICheckboxProps = ICheckboxBaseProps &
  Omit<IViewProps, keyof ICheckboxBaseProps | 'children' | 'ref'> & {
    class?: IClassNameValue;
  };
