import { defineComponent } from 'vue';
import { PixelRatio, Platform, StyleSheet, useColorScheme, useWindowDimensions } from '@symbiote-native/vue';
import { useAppPhase, useKeyboardHeight } from './canary-hooks';

const PLATFORM_KIND = Platform.select({ ios: 'native ios', android: 'native android', default: '?' });
const PAD_NOTE = Platform.isPad ? ' · iPad' : '';
const PLATFORM_NOTE =
  `${Platform.OS} ${Platform.Version}${PAD_NOTE} · ${PLATFORM_KIND}` +
  ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`;

// Runtime modules read live. A fractional hairline (0.333 on @3x) proves the scale resolved
export const CanaryRuntimeNotes = defineComponent({
  name: 'CanaryRuntimeNotes',
  setup() {
    const keyboardHeight = useKeyboardHeight();
    const dimensions = useWindowDimensions();
    const colorScheme = useColorScheme();
    const appPhase = useAppPhase();
    return () => (
      <>
        <text class="header-note">
          {keyboardHeight.value > 0 ? `keyboard up · ${keyboardHeight.value}px` : 'keyboard down'}
        </text>
        <text class="hairline-note" style={{ borderTopWidth: StyleSheet.hairlineWidth }}>
          {PLATFORM_NOTE}
        </text>
        <text class="header-note">
          {`${Math.round(dimensions.value.width)}×${Math.round(dimensions.value.height)} @${PixelRatio.get()}x` +
            ` · ${colorScheme.value ?? 'no-scheme'} · ${appPhase.value}`}
        </text>
      </>
    );
  },
});
