import { defineComponent, type VNode } from '@vue/runtime-core';
import { descriptorToVue, normalizeVueAttrs } from '@symbiote-native/vue';
import type { IViewProps } from '@symbiote-native/vue';
import { renderGlassContainer, renderGlassView } from '../core';
import type { IGlassContainerProps, IGlassViewProps } from '../core';

// Поверхность View как у `ViewProps` в upstream, дети идут слотом по умолчанию
export type IGlassViewVueProps = IGlassViewProps &
  Omit<IViewProps, keyof IGlassViewProps>;

export type IGlassContainerVueProps = IGlassContainerProps &
  Omit<IViewProps, keyof IGlassContainerProps>;

/** Vue twin of `expo-glass-effect`'s `GlassView`, native on iOS and a plain View elsewhere */
export const GlassView = defineComponent({
  name: 'GlassView',
  // Все атрибуты это пропсы нативного view, на обёртку ничего не должно просочиться
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return (): VNode =>
      descriptorToVue(
        renderGlassView(normalizeVueAttrs(attrs)),
        slots.default?.() ?? [],
      );
  },
});

/** Vue twin of `expo-glass-effect`'s `GlassContainer`, merges the glass views it holds */
export const GlassContainer = defineComponent({
  name: 'GlassContainer',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return (): VNode =>
      descriptorToVue(
        renderGlassContainer(normalizeVueAttrs(attrs)),
        slots.default?.() ?? [],
      );
  },
});
