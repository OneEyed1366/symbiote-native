<script>
  // The hooks that keep working between renders, one of each per visit
  import Animated, {
    useAnimatedReaction,
    useAnimatedRef,
    useFrameCallback,
    useScrollOffset,
    useSharedValue,
    withRepeat,
    withTiming,
  } from '../../../../../packages/reanimated/src/svelte/index';
  import { live, workletOf } from './svelte-reanimated-handle';

  const scroller = useAnimatedRef();
  live.tagOfRef = () => scroller.getTag();
  useScrollOffset(scroller);
  const spin = useSharedValue(0);
  spin.value = withRepeat(withTiming(360, { duration: 100 }), -1);

  useAnimatedReaction(
    workletOf(() => spin.value, [spin], 4),
    workletOf(
      () => {
        live.reactions += 1;
      },
      [],
      5,
    ),
  );
  useFrameCallback(
    workletOf(
      () => {
        live.frames += 1;
      },
      [spin],
      6,
    ),
  );
</script>

<Animated.ScrollView ref={scroller}>
  <view testID="ra-live" />
</Animated.ScrollView>
