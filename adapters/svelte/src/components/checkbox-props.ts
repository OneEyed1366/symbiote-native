// Пропсы `<checkbox>` для Svelte, самого компонента нет, элемент это тег
// Базовые поля общие (<prop_types_split_agnostic_vs_per_adapter>), `class` свой у Svelte
import type { ICheckboxProps as ICheckboxBaseProps } from '@symbiote-native/components';
import type { ISvelteClassValue } from '../class-value';
import type { IViewProps } from './view-props';

export type ICheckboxProps = ICheckboxBaseProps &
  Omit<IViewProps, keyof ICheckboxBaseProps | 'children' | 'class'> & {
    class?: ISvelteClassValue;
  };
