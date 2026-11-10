<script setup lang="ts">
import { computed } from 'vue';
import {
  PixelRatio,
  Platform,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
} from '@symbiote-native/vue';
import { useAppPhase, useKeyboardHeight } from './canary-hooks';

const dimensions = useWindowDimensions();
const colorScheme = useColorScheme();
const PLATFORM_KIND = Platform.select({ ios: 'native ios', android: 'native android', default: '?' });
const PAD_NOTE = Platform.isPad ? ' · iPad' : '';
const PLATFORM_NOTE =
  `${Platform.OS} ${Platform.Version}${PAD_NOTE} · ${PLATFORM_KIND}` +
  ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`;
const HAIRLINE_STYLE = { borderTopWidth: StyleSheet.hairlineWidth };

const keyboardHeight = useKeyboardHeight();
const appPhase = useAppPhase();
const keyboardNote = computed(() =>
  keyboardHeight.value > 0 ? `keyboard up · ${keyboardHeight.value}px` : 'keyboard down',
);
const screenNote = computed(
  () =>
    `${Math.round(dimensions.value.width)}×${Math.round(dimensions.value.height)} @${PixelRatio.get()}x` +
    ` · ${colorScheme.value ?? 'no-scheme'} · ${appPhase.value}`,
);
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
