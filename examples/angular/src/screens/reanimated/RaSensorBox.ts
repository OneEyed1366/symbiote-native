import { Component } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
} from '@symbiote-native/angular';
import {
  SensorType,
  useAnimatedSensor,
  useAnimatedStyle,
} from '@symbiote-native/reanimated/angular';

const TILT_SCALE = 40;
const SENSOR_INTERVAL_MS = 50;

// A worklet closes over locals of its factory, as `this` does not cross to the UI runtime
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

// A box that leans with the device: needs a real sensor, so it is mounted on request
@Component({
  selector: 'RaSensorBox',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, SymbioteHostPropsDirective],
  template: `<view
    testID="ra-sensor-box"
    class="ra-box"
    [symbioteHostProps]="lean"
  ></view>`,
})
export class RaSensorBox {
  readonly lean = createLean();
}
