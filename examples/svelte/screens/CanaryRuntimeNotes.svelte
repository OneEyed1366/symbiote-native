<script lang="ts">
  import {
    AppState,
    KEYBOARD_EVENT,
    Keyboard,
    PixelRatio,
    Platform,
    StyleSheet,
    useColorScheme,
    useWindowDimensions,
  } from '@symbiote-native/svelte';
  import { keyboardHeightOf } from './canary-shared';

  const windowSize = useWindowDimensions();
  const colorScheme = useColorScheme();
  const platformKind = Platform.select({ ios: 'native ios', android: 'native android', default: '?' });
  const padNote = Platform.isPad ? ' · iPad' : '';
  let keyboardHeight = $state(0);
  let appPhase = $state<string>(AppState.currentState ?? 'unknown');

  // native -> JS: the device hub pushes keyboard frames, the height is read live
  $effect(() => {
    const onShow = (payload: unknown): void => {
      keyboardHeight = keyboardHeightOf(payload);
    };
    const subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, () => (keyboardHeight = 0)),
    ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  });

  // native -> JS: AppState pushes lifecycle changes, the current phase is read live
  $effect(() => {
    const subscription = AppState.addEventListener('change', (...args: unknown[]) => {
      const next = args[0];
      if (typeof next === 'string') appPhase = next;
    });
    return () => subscription.remove();
  });

  const keyboardNote = $derived(keyboardHeight > 0 ? `keyboard up · ${keyboardHeight}px` : 'keyboard down');
  const platformNote =
    `${Platform.OS} ${Platform.Version}${padNote} · ${platformKind}` +
    ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`;
  const screenNote = $derived(
    `${Math.round(windowSize.current.width)}×${Math.round(windowSize.current.height)}` +
      ` @${PixelRatio.get()}x · ${colorScheme.current ?? 'no-scheme'} · ${appPhase}`,
  );
</script>

<text class="header-note">{keyboardNote}</text>
<!-- The border below is the hairline itself -->
<text class="hairline-note" style={{ borderTopWidth: StyleSheet.hairlineWidth }}>{platformNote}</text>
<text class="header-note">{screenNote}</text>
