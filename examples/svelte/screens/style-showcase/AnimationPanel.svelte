<script lang="ts">
  import { Animated } from '@symbiote-native/svelte';

  const PULSE_MS = 1_600;
  const PULSE_INPUT = [0, 0.5, 1];

  // Top-level script consts run once per instance, no ref trick needed
  const pulse = new Animated.Value(0);

  // Native driver, so an always-on pulse costs no per-frame JS
  // Nothing reactive is read, so the effect runs once on mount and cleans up on unmount
  $effect(() => {
    const animation = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: PULSE_MS,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  });

  const pulseStyle = {
    opacity: pulse.interpolate({
      inputRange: PULSE_INPUT,
      outputRange: [1, 0.55, 1],
    }),
    transform: [
      {
        scale: pulse.interpolate({
          inputRange: PULSE_INPUT,
          outputRange: [1, 1.18, 1],
        }),
      },
    ],
  };
</script>

<view class="sc-panel">
  <text class="sc-panel-title">5 · An animation on top of a class</text>
  <text class="sc-panel-note">
    The class owns the whole static look; the Animated.Value writes only
    transform and opacity. If a frame clobbered the resolved class the tile
    would lose its ring and its corners mid-pulse rather than merely stop
    moving — the two are independent, and the ring is the tell.
  </text>
  <view class="sc-anim-frame">
    <view class="sc-anim-tile" testID="sc-anim-tile" style={pulseStyle}>
      <text class="sc-anim-text">class + frame</text>
    </view>
  </view>
</view>
