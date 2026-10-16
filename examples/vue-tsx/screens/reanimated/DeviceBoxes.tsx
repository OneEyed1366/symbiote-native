import { defineComponent } from 'vue';
import {
  SensorType,
  useAnimatedKeyboard,
  useAnimatedSensor,
  useAnimatedStyle,
} from '@symbiote-native/reanimated/vue';

const TILT_SCALE = 40;
const SENSOR_INTERVAL_MS = 50;

// A box that leans with the device: needs a real sensor, so it is mounted on request
export const SensorBox = defineComponent(() => {
  const rotation = useAnimatedSensor(SensorType.ROTATION, {
    interval: SENSOR_INTERVAL_MS,
  });

  const lean = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        { translateX: rotation.sensor.value.roll * TILT_SCALE },
        { translateY: rotation.sensor.value.pitch * TILT_SCALE },
      ],
    };
  });

  return () => <view testID="ra-sensor-box" class="ra-box" style={lean} />;
});

// A box that rides on top of the keyboard, whatever its height
export const KeyboardBox = defineComponent(() => {
  const keyboard = useAnimatedKeyboard();

  const lift = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ translateY: -keyboard.height.value }] };
  });

  return () => (
    <view class="ra-stage">
      <view testID="ra-keyboard-box" class="ra-box" style={lift} />
      <text-input
        testID="ra-keyboard-input"
        class="ra-field"
        placeholder="focus me"
      />
    </view>
  );
});
