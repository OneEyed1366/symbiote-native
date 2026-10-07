<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  AppState,
  KEYBOARD_EVENT,
  Keyboard,
  PixelRatio,
  Platform,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
} from '@symbiote-native/vue';
import { keyboardHeightOf } from './canary-shared';

const dimensions = useWindowDimensions();
const colorScheme = useColorScheme();
const PLATFORM_KIND = Platform.select({ ios: 'native ios', android: 'native android', default: '?' });
const PAD_NOTE = Platform.isPad ? ' · iPad' : '';
const PLATFORM_NOTE =
  `${Platform.OS} ${Platform.Version}${PAD_NOTE} · ${PLATFORM_KIND}` +
  ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`;
const HAIRLINE_STYLE = { borderTopWidth: StyleSheet.hairlineWidth };

const keyboardHeight = ref(0);
const appPhase = ref<string>(AppState.currentState ?? 'unknown');
const keyboardNote = computed(() =>
  keyboardHeight.value > 0 ? `keyboard up · ${keyboardHeight.value}px` : 'keyboard down',
);
const screenNote = computed(
  () =>
    `${Math.round(dimensions.value.width)}×${Math.round(dimensions.value.height)} @${PixelRatio.get()}x` +
    ` · ${colorScheme.value ?? 'no-scheme'} · ${appPhase.value}`,
);

// native -> JS: the device hub pushes keyboard frames, the height is read live
let keyboardSubs: Array<{ remove(): void }> = [];
let appStateSub: { remove(): void } | undefined;
onMounted(() => {
  const onShow = (payload: unknown): void => {
    keyboardHeight.value = keyboardHeightOf(payload);
  };
  keyboardSubs = [
    Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
    Keyboard.addListener(KEYBOARD_EVENT.didHide, () => {
      keyboardHeight.value = 0;
    }),
  ];
  appStateSub = AppState.addEventListener('change', (...args: unknown[]) => {
    const next = args[0];
    if (typeof next === 'string') appPhase.value = next;
  });
});
onUnmounted(() => {
  keyboardSubs.forEach(subscription => subscription.remove());
  appStateSub?.remove();
});
</script>

<template>
  <text class="header-note">
    {{ keyboardNote }}
  </text>
  <!-- The border below is the hairline itself -->
  <text
    class="hairline-note"
    :style="HAIRLINE_STYLE"
  >
    {{ PLATFORM_NOTE }}
  </text>
  <text class="header-note">
    {{ screenNote }}
  </text>
</template>
