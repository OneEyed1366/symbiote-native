<script lang="ts">
  import {
    PerformanceMonitor,
    ReduceMotion,
    ReducedMotionConfig,
    useAnimatedProps,
    useAnimatedStyle,
    useFrameCallback,
    useReducedMotion,
    useSharedValue,
    useTimestamp,
  } from '@symbiote-native/reanimated/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { ACCENT } from './colors';
  import RaKeyboardBox from './RaKeyboardBox.svelte';
  import RaSection from './RaSection.svelte';
  import RaSensorBox from './RaSensorBox.svelte';

  const DEGREES_PER_MS = 0.18;
  const FULL_TURN = 360;

  // A frame callback that turns a box, a timestamp that counts, the reduced-motion switch, the
  // performance monitor, and the two device-bound hooks behind a toggle each
  const angle = useSharedValue<number>(0);
  let isRunning = $state(true);
  let isSensorShown = $state(false);
  let isKeyboardShown = $state(false);
  const isReduced = useReducedMotion();
  const timestamp = useTimestamp();
  const frozenAt = useSharedValue<number>(0);
  const isPaused = useSharedValue<boolean>(false);

  const frame = useFrameCallback(info => {
    'worklet';
    angle.value =
      (angle.value + (info.timeSincePreviousFrame ?? 0) * DEGREES_PER_MS) %
      FULL_TURN;
  });

  const turning = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ rotate: `${angle.value}deg` }] };
  });

  // `useTimestamp` reads its flag once, so a pause is applied to the readout instead
  const clock = useAnimatedProps(() => {
    'worklet';
    const shown = isPaused.value ? frozenAt.value : timestamp.value;
    return { text: `${Math.round(shown)} ms since the first frame` };
  });

  const toggleRunning = () => {
    frozenAt.value = timestamp.value;
    isPaused.value = isRunning;
    frame.setActive(!isRunning);
    isRunning = !isRunning;
  };
</script>

<RaSection
  title="Frames and sensors"
  note="useFrameCallback, useTimestamp, useReducedMotion, PerformanceMonitor, sensors and keyboard"
>
  <ReducedMotionConfig mode={ReduceMotion.System} />
  <view class="ra-row">
    <view testID="ra-frame-box" class="ra-box" style={turning} />
    <text-input
      testID="ra-frame-clock"
      class="ra-readout"
      editable={false}
      p={{ animatedProps: clock }}
    />
  </view>
  <text class="ra-note">{`reduced motion: ${isReduced ? 'on' : 'off'}`}</text>
  <PerformanceMonitor />
  <view class="ra-wrap">
    <ActionButton
      testID="ra-frame-toggle"
      title={isRunning ? 'pause' : 'resume'}
      onPress={toggleRunning}
      color={ACCENT}
    />
    <ActionButton
      testID="ra-sensor-toggle"
      title={isSensorShown ? 'hide sensor' : 'show sensor'}
      onPress={() => (isSensorShown = !isSensorShown)}
      color={ACCENT}
    />
    <ActionButton
      testID="ra-keyboard-toggle"
      title={isKeyboardShown ? 'hide keyboard box' : 'show keyboard box'}
      onPress={() => (isKeyboardShown = !isKeyboardShown)}
      color={ACCENT}
    />
  </view>
  {#if isSensorShown}
    <RaSensorBox />
  {/if}
  {#if isKeyboardShown}
    <RaKeyboardBox />
  {/if}
</RaSection>
