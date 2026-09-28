<script lang="ts">
  // Split off CanaryScreen.svelte to keep it under 400 lines: modern style props reaching
  // Fabric's C++ parser, plus the KeyboardAvoidingView enabled toggle.
  import {
    KeyboardAvoidingView,
    Platform,
    type ISwitchChangeEvent,
  } from '@symbiote-native/svelte';

  const ACCENT = '#ff3e00';
  const HAIRLINE = '#3a3a3a';
  const PLACEHOLDER_COLOR = '#6a6a6a';

  let kavEnabled = $state(true);
</script>

<!-- Each style is an A/B so the effect is unmistakable on the dark theme. boxShadow: a FLAME
     glow. PASS: a soft orange halo bleeds out around the panel. -->
<view class="shadow-card" style={{ boxShadow: `0px 0px 22px 3px ${ACCENT}88` }}>
  <text class="note-text">boxShadow · flame glow</text>
</view>
<!-- filter: PASS: the right panel is clearly darker than the left. -->
<view class="row">
  <view class="filter-tile">
    <text class="tile-text">no filter</text>
  </view>
  <view class="filter-tile" style={{ filter: [{ brightness: 0.5 }] }}>
    <text class="tile-text">brightness 0.5</text>
  </view>
</view>
<!-- transformOrigin: PASS: the left edge stays put while the bottom-right swings down. -->
<view
  class="rotated-card"
  style={{ transformOrigin: 'top left', transform: [{ rotate: '4deg' }] }}
>
  <text class="tile-text">transformOrigin · top-left</text>
</view>
<!-- background-image: a CSS linear-gradient authored in App.css (.gradient-card). PASS: the
     panel shows a flame-to-peach gradient sweeping left to right. -->
<view class="gradient-card">
  <text class="tile-text">background-image · linear-gradient</text>
</view>
<!-- Image web aliases. PASS: the logo loads via the web-alias fold; a screen reader reads the
     alt text (folded to accessibilityLabel). -->
<image
  src="https://svelte.dev/favicon.png"
  alt="Svelte logo"
  width={48}
  height={48}
  class="web-image"
/>
<!-- KeyboardAvoidingView enabled toggle. PASS: with enabled ON, focusing the field lifts it
     above the keyboard AND the keyboard is the email layout. With OFF it covers the field. -->
<view class="switch-row">
  <text class="switch-label">avoid keyboard</text>
  <switch
    value={kavEnabled}
    onValueChange={(event: ISwitchChangeEvent) => (kavEnabled = event.value)}
    trackColor={{ false: HAIRLINE, true: ACCENT }}
  />
</view>
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  enabled={kavEnabled}
>
  <text-input
    autoComplete="email"
    inputMode="email"
    enterKeyHint="done"
    placeholder="email - focus me near the bottom..."
    placeholderTextColor={PLACEHOLDER_COLOR}
    class="text-input"
  ></text-input>
</KeyboardAvoidingView>
