import { useState } from 'react';
import Animated, {
  PerformanceMonitor,
  ReduceMotion,
  ReducedMotionConfig,
  TextInput,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  useTimestamp,
} from '@symbiote-native/reanimated/react';
import { ActionButton } from '../../components/ActionButton';
import { KeyboardBox, SensorBox } from './DeviceBoxes';
import { Section } from './Section';

const DEGREES_PER_MS = 0.18;
const FULL_TURN = 360;
const TOGGLE_COLOR = '#4ea1ff';

// A frame callback that turns a box, a timestamp that counts, the reduced-motion switch, the
// performance monitor, and the two device-bound hooks behind a toggle each
export function FramesSection() {
  const angle = useSharedValue<number>(0);
  const [isRunning, setIsRunning] = useState(true);
  const [isSensorShown, setIsSensorShown] = useState(false);
  const [isKeyboardShown, setIsKeyboardShown] = useState(false);
  const isReduced = useReducedMotion();
  const timestamp = useTimestamp(isRunning);

  const frame = useFrameCallback(info => {
    angle.value =
      (angle.value + (info.timeSincePreviousFrame ?? 0) * DEGREES_PER_MS) %
      FULL_TURN;
  });

  const turning = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angle.value}deg` }],
  }));

  const clock = useAnimatedProps(() => ({
    text: `${Math.round(timestamp.value)} ms since the first frame`,
  }));

  const toggleRunning = () => {
    frame.setActive(!isRunning);
    setIsRunning(!isRunning);
  };

  return (
    <Section
      title="Frames and sensors"
      note="useFrameCallback, useTimestamp, useReducedMotion, PerformanceMonitor, sensors and keyboard"
    >
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <view className="ra-row">
        <Animated.View
          testID="ra-frame-box"
          className="ra-box"
          style={turning}
        />
        <TextInput
          testID="ra-frame-clock"
          className="ra-readout"
          editable={false}
          animatedProps={clock}
        />
      </view>
      <text className="ra-note">{`reduced motion: ${isReduced ? 'on' : 'off'}`}</text>
      <PerformanceMonitor />
      <view className="ra-wrap">
        <ActionButton
          testID="ra-frame-toggle"
          title={isRunning ? 'pause' : 'resume'}
          onPress={toggleRunning}
          color={TOGGLE_COLOR}
        />
        <ActionButton
          testID="ra-sensor-toggle"
          title={isSensorShown ? 'hide sensor' : 'show sensor'}
          onPress={() => setIsSensorShown(!isSensorShown)}
          color={TOGGLE_COLOR}
        />
        <ActionButton
          testID="ra-keyboard-toggle"
          title={isKeyboardShown ? 'hide keyboard box' : 'show keyboard box'}
          onPress={() => setIsKeyboardShown(!isKeyboardShown)}
          color={TOGGLE_COLOR}
        />
      </view>
      {isSensorShown ? <SensorBox /> : null}
      {isKeyboardShown ? <KeyboardBox /> : null}
    </Section>
  );
}
