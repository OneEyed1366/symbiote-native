import {
  Fragment,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  type VNode,
} from '@vue/runtime-core';
import { descriptorToVue, normalizeVueAttrs } from '@symbiote-native/vue';
import type { IViewProps } from '@symbiote-native/vue';
import { renderSymbolView, watchSymbolFont } from '../core';
import type { ISymbolViewProps } from '../core';

// Поверхность View как у `ViewProps` в upstream, запасной вариант идёт слотом `fallback`
export type ISymbolViewVueProps = ISymbolViewProps &
  Omit<IViewProps, keyof ISymbolViewProps>;

/** Vue twin of `expo-symbols`' `SymbolView`, the `fallback` slot paints without a symbol */
export const SymbolView = defineComponent({
  name: 'SymbolView',
  // Все атрибуты это пропсы нативного view, на обёртку ничего не должно просочиться
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    const isFontLoaded = ref(false);
    let cancelWatch = (): void => {};
    // Шрифт грузится один раз при монтировании, как в upstream
    onMounted(() => {
      cancelWatch = watchSymbolFont(normalizeVueAttrs(attrs), isLoaded => {
        isFontLoaded.value = isLoaded;
      });
    });
    onBeforeUnmount(() => cancelWatch());

    return (): VNode => {
      const descriptor = renderSymbolView(
        normalizeVueAttrs(attrs),
        isFontLoaded.value,
      );
      return descriptor
        ? descriptorToVue(descriptor)
        : h(Fragment, slots.fallback?.() ?? []);
    };
  },
});
