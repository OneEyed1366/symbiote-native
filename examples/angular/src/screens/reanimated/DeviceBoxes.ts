import { Component } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
} from '@symbiote-native/angular';
import {
  SensorType,
  useAnimatedKeyboard,
  useAnimatedSensor,
  useAnimatedStyle,
} from '@symbiote-native/reanimated/angular';

const TILT_SCALE = 40;
const SENSOR_INTERVAL_MS = 50;

// A worklet closes over locals of its factory, as `this` does not cross to the UI runtime
function createLift() {
  const keyboard = useAnimatedKeyboard();

  const lift = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ translateY: -keyboard.height.value }] };
  });
  return { style: lift };
}

function createLean() {
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
  return { style: lean };
}

// A box that rides on top of the keyboard, whatever its height
@Component({
  selector: 'KeyboardBox',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, SymbioteHostPropsDirective],
  template: `
    <view class="ra-stage">
      <view
        testID="ra-keyboard-box"
        class="ra-box"
        [symbioteHostProps]="lift"
      ></view>
      <text-input
        testID="ra-keyboard-input"
        class="ra-field"
        placeholder="focus me"
      ></text-input>
    </view>
  `,
})
export class KeyboardBox {
  readonly lift = createLift();
}

// A box that leans with the device: needs a real sensor, so it is mounted on request
@Component({
  selector: 'SensorBox',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, SymbioteHostPropsDirective],
  template: `<view
    testID="ra-sensor-box"
    class="ra-box"
    [symbioteHostProps]="lean"
  ></view>`,
})
export class SensorBox {
  readonly lean = createLean();
}
