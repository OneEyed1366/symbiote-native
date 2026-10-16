import Animated, {
  SensorType,
  useAnimatedKeyboard,
  useAnimatedSensor,
  useAnimatedStyle,
} from '@symbiote-native/reanimated/react';

const TILT_SCALE = 40;
const SENSOR_INTERVAL_MS = 50;

// A box that leans with the device: needs a real sensor, so it is mounted on request
export function SensorBox() {
  const rotation = useAnimatedSensor(SensorType.ROTATION, {
    interval: SENSOR_INTERVAL_MS,
  });

  const lean = useAnimatedStyle(() => ({
    transform: [
      { translateX: rotation.sensor.value.roll * TILT_SCALE },
      { translateY: rotation.sensor.value.pitch * TILT_SCALE },
    ],
  }));

  return (
    <Animated.View testID="ra-sensor-box" className="ra-box" style={lean} />
  );
}

// A box that rides on top of the keyboard, whatever its height
export function KeyboardBox() {
  const keyboard = useAnimatedKeyboard();

  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboard.height.value }],
  }));

  return (
    <view className="ra-stage">
      <Animated.View testID="ra-keyboard-box" className="ra-box" style={lift} />
      <text-input
        testID="ra-keyboard-input"
        className="ra-field"
        placeholder="focus me"
      />
    </view>
  );
}
