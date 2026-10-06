import { defineComponent, type VNode } from '@vue/runtime-core';
import { descriptorToVue, normalizeVueAttrs } from '@symbiote-native/vue';
import type { IViewProps } from '@symbiote-native/vue';
import { renderLinearGradient } from '../core/linear-gradient';
import type { ILinearGradientProps as ILinearGradientBaseProps } from '../core/linear-gradient';

// Поверхность View как у `ViewProps` в upstream, дети идут слотом по умолчанию
export type ILinearGradientProps = ILinearGradientBaseProps &
  Omit<IViewProps, keyof ILinearGradientBaseProps>;

/** Vue twin of `expo-linear-gradient`'s `LinearGradient`, the default slot paints over it */
export const LinearGradient = defineComponent({
  name: 'LinearGradient',
  // Все атрибуты это пропсы нативного view, на обёртку ничего не должно просочиться
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return (): VNode => {
      const descriptor = renderLinearGradient(normalizeVueAttrs(attrs));
      // Слот приложения идёт в корень после собственных детей дескриптора
      return descriptorToVue(descriptor, slots.default?.() ?? []);
    };
  },
});
