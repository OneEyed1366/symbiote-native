import {
  defineComponent,
  h,
  isRef,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  toRaw,
  type VNode,
} from '@vue/runtime-core';
import { descriptorToVue, normalizeVueAttrs } from '@symbiote-native/vue';
import type { IViewProps } from '@symbiote-native/vue';
import {
  renderBlurTargetView,
  renderBlurView,
  warnBlurProps,
  watchBlurTarget,
} from '../core';
import type { IBlurTargetViewProps, IBlurViewProps } from '../core';

// Поверхность View как у `ViewProps` в upstream, дети идут слотом по умолчанию
export type IBlurViewVueProps = IBlurViewProps &
  Omit<IViewProps, keyof IBlurViewProps> & {
    /** Template ref на `BlurTargetView`, его содержимое это фон для размытия */
    blurTarget?: unknown;
  };

export type IBlurTargetViewVueProps = IBlurTargetViewProps &
  Omit<IViewProps, keyof IBlurTargetViewProps>;

// Template ref на компонент отдаёт его публичный экземпляр, корневой host-узел лежит в `$el`
function hostOf(target: unknown): unknown {
  const value = isRef(target) ? target.value : target;
  const host =
    value !== null && typeof value === 'object' && '$el' in value
      ? value.$el
      : value;
  return toRaw(host);
}

/** Vue twin of `expo-blur`'s `BlurView`, the default slot paints over the blur */
export const BlurView = defineComponent({
  name: 'BlurView',
  // Все атрибуты это пропсы нативного view, на обёртку ничего не должно просочиться
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    const blurTargetId = ref<number | undefined>();
    let cancelWatch = (): void => {};
    const syncTarget = (): void => {
      cancelWatch();
      cancelWatch = watchBlurTarget(hostOf(attrs.blurTarget), id => {
        blurTargetId.value = id;
      });
    };
    // Ref цели ставится при патче, поэтому читаем его после монтирования и каждого обновления
    onMounted(() => {
      syncTarget();
      warnBlurProps(normalizeVueAttrs(attrs), attrs.blurTarget !== undefined);
    });
    onUpdated(syncTarget);
    onBeforeUnmount(() => cancelWatch());

    return (): VNode => {
      const { blurTarget: _blurTarget, ...rest } = normalizeVueAttrs(attrs);
      const descriptor = renderBlurView(rest, blurTargetId.value);
      return descriptorToVue(descriptor, slots.default?.() ?? []);
    };
  },
});

/** Vue twin of `expo-blur`'s `BlurTargetView`, native on Android and a plain View on iOS */
export const BlurTargetView = defineComponent({
  name: 'BlurTargetView',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return (): VNode => {
      const descriptor = renderBlurTargetView(normalizeVueAttrs(attrs));
      return h(descriptor.type, descriptor.props, slots.default?.() ?? []);
    };
  },
});
