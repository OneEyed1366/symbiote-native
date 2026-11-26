<script>
  import {
    useAnimatedProps,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
  } from '../../../../../packages/reanimated/src/svelte/index';
  import { probe, workletOf } from './svelte-reanimated-handle';

  let { row } = $props();

  const opacity = useSharedValue(1);
  const halved = useDerivedValue(
    workletOf(() => opacity.value / 2, [opacity], 1),
  );
  const fading = useAnimatedStyle(
    workletOf(() => ({ opacity: opacity.value }), [opacity], 2),
  );
  const labelled = useAnimatedProps(
    workletOf(
      () => ({ accessibilityLabel: String(halved.value) }),
      [halved],
      3,
    ),
  );

  if (row === 0) probe.fadeFirstRow = value => (opacity.value = value);
</script>

<view testID={`ra-row-${row}`} style={fading} p={{ animatedProps: labelled }}>
  <text>{row}</text>
</view>
