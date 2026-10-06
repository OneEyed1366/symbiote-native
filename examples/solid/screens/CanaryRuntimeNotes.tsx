import {
  PixelRatio,
  Platform,
  StyleSheet,
  createColorScheme,
  createWindowDimensions,
} from '@symbiote-native/solid';
import { createAppPhase, createKeyboardHeight } from './canary-hooks';

const PLATFORM_KIND = Platform.select({ ios: 'native ios', android: 'native android', default: '?' });
const PAD_NOTE = Platform.isPad ? ' · iPad' : '';
const PLATFORM_NOTE =
  `${Platform.OS} ${Platform.Version}${PAD_NOTE} · ${PLATFORM_KIND}` +
  ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`;

// Runtime modules read live. A fractional hairline (0.333 on @3x) proves the scale resolved
export function CanaryRuntimeNotes() {
  const keyboardHeight = createKeyboardHeight();
  const dimensions = createWindowDimensions();
  const colorScheme = createColorScheme();
  const appPhase = createAppPhase();
  return (
    <>
      <text class="header-note">
        {keyboardHeight() > 0 ? `keyboard up · ${keyboardHeight()}px` : 'keyboard down'}
      </text>
      <text class="hairline-note" style={{ borderTopWidth: StyleSheet.hairlineWidth }}>
        {PLATFORM_NOTE}
      </text>
      <text class="header-note">
        {`${Math.round(dimensions().width)}×${Math.round(dimensions().height)} @${PixelRatio.get()}x` +
          ` · ${colorScheme() ?? 'no-scheme'} · ${appPhase()}`}
      </text>
    </>
  );
}
