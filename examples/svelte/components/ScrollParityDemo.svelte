<script lang="ts">
  // Split off CanaryScreen.svelte to keep it under 400 lines: the native-driver Animated.event
  // scroll-header proof, plus the freeze-JS button that demonstrates it stays UI-thread driven.
  import { Animated } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';

  const WARN = '#fc8181';
  const FREEZE_MS = 3_000;
  const SCROLL_ROW_COUNT = 6;
  const SCROLL_EVENT_THROTTLE_MS = 16;
  const HEADER_FADE_DISTANCE = 120;

  const parityScrollY = new Animated.Value(0);
  const parityHeaderOpacity = parityScrollY.interpolate({
    inputRange: [0, HEADER_FADE_DISTANCE],
    outputRange: [1, 0.12],
    extrapolate: 'clamp',
  });
  const parityHeaderTranslateY = parityScrollY.interpolate({
    inputRange: [0, HEADER_FADE_DISTANCE],
    outputRange: [0, -16],
    extrapolate: 'clamp',
  });
  const onParityScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: parityScrollY } } }],
    { useNativeDriver: true },
  );

  const scrollRows = Array.from(
    { length: SCROLL_ROW_COUNT },
    (_unused, index) => index,
  );

  // JAM the JS thread; header motion during the freeze can only come from the native driver.
  function freezeJs(): void {
    const until = Date.now() + FREEZE_MS;
    while (Date.now() < until) {
      // deliberately blocking: no JS frame runs here
    }
  }
</script>

<!-- Scroll-driven header on the native driver. PASS: drag INSIDE the box below: the bright bar
     above smoothly fades and lifts, on the UI thread. `Animated.event` binds through
     `bindAnimatedEvent` on ANY host node, so the bare tag below is the whole API. -->
<view
  class="parity-header"
  style={{
    opacity: parityHeaderOpacity,
    transform: [{ translateY: parityHeaderTranslateY }],
  }}
>
  <text class="parity-header-text">HEADER — fades as you scroll ↓</text>
</view>
<!-- box-list160 is shared with the MVCP FlatList. -->
<scroll-view
  class="box-list160"
  nestedScrollEnabled
  scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
  p={{ onScroll: onParityScroll }}
>
  {#each scrollRows as row (row)}
    <view class="scroll-demo-row">
      <text class="list-row-text">{`scroll me · row ${row}`}</text>
    </view>
  {/each}
</scroll-view>
<text class="tiny-center">↑ drag inside the box — the bar above reacts</text>
<!-- Tap Freeze, then immediately drag the box above: if the bar keeps moving, the scroll event
     drives parityScrollY on the UI thread rather than the JS thread. -->
<ActionButton
  title="Freeze JS 3s — then scroll the box ↑"
  color={WARN}
  onPress={freezeJs}
/>
<text class="tiny-center">
  tap Freeze, then immediately drag the box — bar should still move
</text>
