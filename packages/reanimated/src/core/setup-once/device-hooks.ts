import type {
  AnimatedKeyboardInfo,
  AnimatedKeyboardOptions,
  AnimatedSensor,
  SensorConfig,
  SensorType,
  Value3D,
  ValueRotation,
} from 'react-native-reanimated/src/commonTypes';
import { createAnimatedKeyboard } from '../animated-keyboard';
import { createAnimatedSensor } from '../animated-sensor';
import type { ISetupOnceLifecycle } from './lifecycle';

// The rotation sensor reports a rotation, every other one a vector
type ISensorReading<Type extends SensorType> = Type extends SensorType.ROTATION
  ? ValueRotation
  : Value3D;

// The hooks that read the device
export function createDeviceHooks({ onDispose }: ISetupOnceLifecycle) {
  // The configuration is read once, as setup runs once
  function useAnimatedSensor<Type extends SensorType>(
    sensorType: Type,
    userConfig?: Partial<SensorConfig>,
  ): AnimatedSensor<ISensorReading<Type>> {
    const controller = createAnimatedSensor<ISensorReading<Type>>(sensorType, {
      ...userConfig,
    });
    onDispose(controller.start());
    return controller.output;
  }

  /** @deprecated upstream deprecates it in favor of `react-native-keyboard-controller` */
  function useAnimatedKeyboard(
    options?: AnimatedKeyboardOptions,
  ): AnimatedKeyboardInfo {
    const keyboard = createAnimatedKeyboard(options);
    keyboard.subscribe();
    onDispose(keyboard.unsubscribe);
    return keyboard.info;
  }

  return { useAnimatedSensor, useAnimatedKeyboard };
}
