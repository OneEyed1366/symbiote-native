<script lang="ts">
  // A scroll-driven header on the native driver, and a freeze button that shows it stays there
  import { Animated } from '@symbiote-native/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { FREEZE_MS } from './canary-shared';

  const WARN = '#fc8181';
  const SCROLL_ROW_COUNT = 6;
  const SCROLL_EVENT_THROTTLE_MS = 16;
  const HEADER_FADE_DISTANCE = 120;

  const scrollY = new Animated.Value(0);
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_FADE_DISTANCE],
    outputRange: [1, 0.12],
    extrapolate: 'clamp',
  });
  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, HEADER_FADE_DISTANCE],
    outputRange: [0, -16],
    extrapolate: 'clamp',
  });
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true },
  );

  const scrollRows = Array.from(
    { length: SCROLL_ROW_COUNT },
    (_unused, index) => index,
  );

  function freezeJsThread(): void {
    const until = Date.now() + FREEZE_MS;
    while (Date.now() < until) {
      // Blocks on purpose: motion during the freeze can only come from the native driver
    }
  }
</script>

<!-- PASS: drag inside the box and the bar above fades and lifts on the UI thread -->
<view
  class="parity-header"
  style={{
    opacity: headerOpacity,
    transform: [{ translateY: headerTranslateY }],
  }}
>
  <text class="parity-header-text">HEADER — fades as you scroll ↓</text>
</view>
<scroll-view
  class="box-list160"
  nestedScrollEnabled
  scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
  p={{ onScroll }}
>
  {#each scrollRows as row (row)}
    <view class="scroll-demo-row">
      <text class="list-row-text">{`scroll me · row ${row}`}</text>
    </view>
  {/each}
</scroll-view>
<text class="tiny-center">↑ drag inside the box — the bar above reacts</text>
<ActionButton
  title="Freeze JS 3s — then scroll the box ↑"
  color={WARN}
  onPress={freezeJsThread}
/>
<text class="tiny-center">
  tap Freeze, then immediately drag the box — bar should still move
</text>
