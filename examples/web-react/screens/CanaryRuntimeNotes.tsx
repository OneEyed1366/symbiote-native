import { PixelRatio, Platform, StyleSheet, useColorScheme, useWindowDimensions } from '@symbiote-native/react';
import { useAppPhase, useKeyboardHeight } from './canary-hooks';

const PLATFORM_KIND = Platform.select({ ios: 'native ios', android: 'native android', default: '?' });

// Runtime modules read live. A fractional hairline (0.333 on @3x) proves the scale resolved
export function CanaryRuntimeNotes() {
  const keyboardHeight = useKeyboardHeight();
  const dimensions = useWindowDimensions();
  const colorScheme = useColorScheme();
  const appPhase = useAppPhase();
  const keyboardNote = keyboardHeight > 0 ? `keyboard up · ${keyboardHeight}px` : 'keyboard down';
  const padNote = Platform.isPad ? ' · iPad' : '';
  const platformNote =
    `${Platform.OS} ${Platform.Version}${padNote} · ${PLATFORM_KIND}` +
    ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`;
  const screenNote =
    `${Math.round(dimensions.width)}×${Math.round(dimensions.height)} @${PixelRatio.get()}x` +
    ` · ${colorScheme ?? 'no-scheme'} · ${appPhase}`;
  return (
    <>
      <text className="header-note">{keyboardNote}</text>
      <text className="hairline-note" style={{ borderTopWidth: StyleSheet.hairlineWidth }}>
        {platformNote}
      </text>
      <text className="header-note">{screenNote}</text>
    </>
  );
}
