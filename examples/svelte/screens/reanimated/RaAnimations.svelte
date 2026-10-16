<script lang="ts">
  import {
    cancelAnimation,
    Easing,
    GentleSpringConfig,
    SnappySpringConfig,
    useAnimatedStyle,
    useSharedValue,
    WigglySpringConfig,
    withClamp,
    withDecay,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
  } from '@symbiote-native/reanimated/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { ACCENT, STOP_COLOR } from './colors';
  import RaSection from './RaSection.svelte';

  const NEAR = 0;
  const FAR = 200;
  const CLAMP_AT = 120;
  const TIMING_MS = 600;
  const DECAY_VELOCITY = 900;
  const REPEAT_FOREVER = -1;
  const PAUSE_MS = 200;

  type IPlay = (at: number) => number;

  // The side of the track the box is not on
  const otherSide = (at: number) => (at > FAR / 2 ? NEAR : FAR);

  const PLAYS = {
    timing: (at: number) =>
      withTiming(otherSide(at), {
        duration: TIMING_MS,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      }),
    snappy: (at: number) => withSpring(otherSide(at), SnappySpringConfig),
    gentle: (at: number) => withSpring(otherSide(at), GentleSpringConfig),
    wiggly: (at: number) => withSpring(otherSide(at), WigglySpringConfig),
    decay: (at: number) =>
      withDecay({
        velocity: at > FAR / 2 ? -DECAY_VELOCITY : DECAY_VELOCITY,
        clamp: [NEAR, FAR],
      }),
    sequence: (at: number) =>
      withSequence(
        withTiming(otherSide(at), { duration: TIMING_MS }),
        withDelay(PAUSE_MS, withTiming(at, { duration: TIMING_MS })),
      ),
    repeat: (at: number) =>
      withRepeat(
        withTiming(otherSide(at), { duration: TIMING_MS }),
        REPEAT_FOREVER,
        true,
      ),
    clamp: (at: number) =>
      withClamp({ min: NEAR, max: CLAMP_AT }, withSpring(otherSide(at))),
  } satisfies Record<string, IPlay>;

  // Timing, the spring presets, decay, sequence, repeat and clamp all drive this one box
  const offset = useSharedValue<number>(NEAR);
  let played = $state('nothing yet');

  const slide = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ translateX: offset.value }] };
  });

  const play = (name: string, start: IPlay) => {
    offset.value = start(offset.value);
    played = name;
  };

  const stop = () => {
    cancelAnimation(offset);
    played = 'cancel';
  };
</script>

<RaSection
  title="Animations"
  note="timing, spring presets, decay, sequence, repeat and clamp on one shared value"
>
  <view class="ra-track">
    <view testID="ra-anim-box" class="ra-box" style={slide} />
  </view>
  <text class="ra-note">{`last: ${played}`}</text>
  <view class="ra-wrap">
    {#each Object.entries(PLAYS) as [name, start] (name)}
      <ActionButton
        testID={`ra-play-${name}`}
        title={name}
        onPress={() => play(name, start)}
        color={ACCENT}
      />
    {/each}
    <ActionButton
      testID="ra-play-cancel"
      title="cancel"
      onPress={stop}
      color={STOP_COLOR}
    />
  </view>
</RaSection>
