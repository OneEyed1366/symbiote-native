import { defineComponent, type VNode } from '@vue/runtime-core';
import {
  defineNativeViewComponent,
  descriptorToVue,
  normalizeVueAttrs,
} from '@symbiote-native/vue';
import { createVideoView, renderVideoAirPlayButton } from '../core';

/** Vue twin of `expo-video`'s `VideoView` */
export const VideoView = defineNativeViewComponent(
  'VideoView',
  createVideoView,
);

/** Vue twin of `expo-video`'s `VideoAirPlayButton`, a plain view off iOS */
export const VideoAirPlayButton = defineComponent({
  name: 'VideoAirPlayButton',
  // Все атрибуты это пропсы нативного view, на обёртку ничего не должно просочиться
  inheritAttrs: false,
  setup(_props, { attrs }) {
    return (): VNode =>
      descriptorToVue(renderVideoAirPlayButton(normalizeVueAttrs(attrs)));
  },
});
