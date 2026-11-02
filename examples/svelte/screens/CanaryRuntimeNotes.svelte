<script lang="ts">
  import {
    PixelRatio,
    Platform,
    StyleSheet,
    useColorScheme,
    useWindowDimensions,
  } from '@symbiote-native/svelte';
  import { useAppPhase, useKeyboardHeight } from './canary-hooks.svelte';

  const windowSize = useWindowDimensions();
  const colorScheme = useColorScheme();
  const keyboardHeight = useKeyboardHeight();
  const appPhase = useAppPhase();
  const platformKind = Platform.select({ ios: 'native ios', android: 'native android', default: '?' });
  const padNote = Platform.isPad ? ' · iPad' : '';

  const keyboardNote = $derived(
    keyboardHeight.current > 0 ? `keyboard up · ${keyboardHeight.current}px` : 'keyboard down',
  );
  const platformNote =
    `${Platform.OS} ${Platform.Version}${padNote} · ${platformKind}` +
    ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`;
  const screenNote = $derived(
    `${Math.round(windowSize.current.width)}×${Math.round(windowSize.current.height)}` +
      ` @${PixelRatio.get()}x · ${colorScheme.current ?? 'no-scheme'} · ${appPhase.current}`,
  );
</script>

<text class="header-note">{keyboardNote}</text>
<!-- The border below is the hairline itself -->
<text class="hairline-note" style={{ borderTopWidth: StyleSheet.hairlineWidth }}>{platformNote}</text>
<text class="header-note">{screenNote}</text>
