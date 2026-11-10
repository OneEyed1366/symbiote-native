import { useEffect, useMemo, useRef } from 'react';
import type {
  AnimatedSensor,
  SensorConfig,
  SensorType,
  Value3D,
  ValueRotation,
} from 'react-native-reanimated/src/commonTypes';
import {
  createAnimatedSensor,
  isSameSensorConfig,
} from '../../core/animated-sensor';

// The rotation sensor reports a rotation, every other one a vector. Upstream says it with two
// overloads, which a typed controller cannot satisfy without a cast
type ISensorReading<Type extends SensorType> = Type extends SensorType.ROTATION
  ? ValueRotation
  : Value3D;

export function useAnimatedSensor<Type extends SensorType>(
  sensorType: Type,
  userConfig?: Partial<SensorConfig>,
): AnimatedSensor<ISensorReading<Type>> {
  const stableConfig = useRef(userConfig);
  if (!isSameSensorConfig(stableConfig.current, userConfig)) {
    stableConfig.current = { ...userConfig };
  }
  const config = stableConfig.current;
  const controller = useMemo(
    () => createAnimatedSensor<ISensorReading<Type>>(sensorType, config),
    [sensorType, config],
  );
  useEffect(() => controller.start(), [controller]);
  return controller.output;
}
