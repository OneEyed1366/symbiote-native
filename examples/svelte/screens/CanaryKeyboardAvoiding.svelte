<script lang="ts">
  import {
    KeyboardAvoidingView,
    Platform,
    type IKeyboardAvoidingBehavior,
    type ISwitchChangeEvent,
  } from '@symbiote-native/svelte';
  import { ACCENT, HAIRLINE, PLACEHOLDER_COLOR } from './canary-shared';

  const KEYBOARD_BEHAVIOR = Platform.select<IKeyboardAvoidingBehavior>({
    ios: 'padding',
    default: 'height',
  });

  let isEnabled = $state(true);
</script>

<!-- PASS: with avoiding on, focusing the field lifts it above the email keyboard -->
<view class="switch-row">
  <text class="switch-label">avoid keyboard</text>
  <switch
    value={isEnabled}
    onValueChange={(event: ISwitchChangeEvent) => (isEnabled = event.value)}
    trackColor={{ false: HAIRLINE, true: ACCENT }}
  />
</view>
<KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} enabled={isEnabled}>
  <text-input
    autoComplete="email"
    inputMode="email"
    enterKeyHint="done"
    placeholder="email - focus me near the bottom..."
    placeholderTextColor={PLACEHOLDER_COLOR}
    class="text-input"
  ></text-input>
</KeyboardAvoidingView>
