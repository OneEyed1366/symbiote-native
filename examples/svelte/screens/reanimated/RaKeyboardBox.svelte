<script lang="ts">
  import {
    useAnimatedKeyboard,
    useAnimatedStyle,
  } from '@symbiote-native/reanimated/svelte';

  // A box that rides on top of the keyboard, whatever its height
  const keyboard = useAnimatedKeyboard();

  const lift = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ translateY: -keyboard.height.value }] };
  });
</script>

<view class="ra-stage">
  <view testID="ra-keyboard-box" class="ra-box" style={lift} />
  <text-input
    testID="ra-keyboard-input"
    class="ra-field"
    placeholder="focus me"
  />
</view>
