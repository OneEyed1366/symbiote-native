import type {
  AnimatedSensor,
  SensorConfig,
  SharedValue,
  Value3D,
  ValueRotation,
} from 'react-native-reanimated/src/commonTypes';
import {
  InterfaceOrientation,
  IOSReferenceFrame,
  SensorType,
} from 'react-native-reanimated/src/commonTypes';
import {
  initializeSensor,
  registerSensor,
  unregisterSensor,
} from 'react-native-reanimated/src/core';

type IReading = Value3D | ValueRotation;

// Euler angles in order ZXY, z = yaw, x = pitch, y = roll
// https://github.com/mrdoob/three.js/blob/dev/src/math/Quaternion.js#L237
function eulerToQuaternion(pitch: number, roll: number, yaw: number) {
  'worklet';
  const c1 = Math.cos(pitch / 2);
  const s1 = Math.sin(pitch / 2);
  const c2 = Math.cos(roll / 2);
  const s2 = Math.sin(roll / 2);
  const c3 = Math.cos(yaw / 2);
  const s3 = Math.sin(yaw / 2);
  return [
    s1 * c2 * c3 - c1 * s2 * s3,
    c1 * s2 * c3 + s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

function adjustRotationToInterfaceOrientation(data: ValueRotation) {
  'worklet';
  const { interfaceOrientation, pitch, roll, yaw } = data;
  if (interfaceOrientation === InterfaceOrientation.ROTATION_90) {
    data.pitch = roll;
    data.roll = -pitch;
    data.yaw = yaw - Math.PI / 2;
  } else if (interfaceOrientation === InterfaceOrientation.ROTATION_270) {
    data.pitch = -roll;
    data.roll = pitch;
    data.yaw = yaw + Math.PI / 2;
  } else if (interfaceOrientation === InterfaceOrientation.ROTATION_180) {
    data.pitch *= -1;
    data.roll *= -1;
    data.yaw *= -1;
  }
  const [qx, qy, qz, qw] = eulerToQuaternion(data.pitch, data.roll, data.yaw);
  data.qx = qx;
  data.qy = qy;
  data.qz = qz;
  data.qw = qw;
  return data;
}

function adjustVectorToInterfaceOrientation(data: Value3D) {
  'worklet';
  const { interfaceOrientation, x, y } = data;
  if (interfaceOrientation === InterfaceOrientation.ROTATION_90) {
    data.x = -y;
    data.y = x;
  } else if (interfaceOrientation === InterfaceOrientation.ROTATION_270) {
    data.x = y;
    data.y = -x;
  } else if (interfaceOrientation === InterfaceOrientation.ROTATION_180) {
    data.x *= -1;
    data.y *= -1;
  }
  return data;
}

function isRotation(data: IReading): data is ValueRotation {
  'worklet';
  return 'qw' in data;
}

export function resolveSensorConfig(
  userConfig?: Partial<SensorConfig>,
): SensorConfig {
  return {
    interval: 'auto',
    adjustToInterfaceOrientation: true,
    iosReferenceFrame: IOSReferenceFrame.Auto,
    ...userConfig,
  };
}

// The settings a sensor is registered against; any other key of the config is not looked at
export function isSameSensorConfig(
  previous: Partial<SensorConfig> | undefined,
  next: Partial<SensorConfig> | undefined,
): boolean {
  return (
    previous?.adjustToInterfaceOrientation ===
      next?.adjustToInterfaceOrientation &&
    previous?.interval === next?.interval &&
    previous?.iosReferenceFrame === next?.iosReferenceFrame
  );
}

export type IAnimatedSensorController<Reading extends IReading = IReading> = {
  output: AnimatedSensor<Reading>;
  // Registers with the device; the returned stop unregisters again
  start: () => () => void;
};

// Which reading a sensor type produces is the caller's claim, the overloads of the hook state it
function isSensorOf<Reading extends IReading>(
  _sensor: unknown,
): _sensor is SharedValue<Reading> {
  return true;
}

export function createAnimatedSensor<Reading extends IReading = IReading>(
  sensorType: SensorType,
  userConfig?: Partial<SensorConfig>,
): IAnimatedSensorController<Reading> {
  const config = resolveSensorConfig(userConfig);
  const sensorData = initializeSensor(sensorType, config);
  const claimed: unknown = sensorData;
  if (!isSensorOf<Reading>(claimed)) throw new Error('unreachable');
  const output: AnimatedSensor<Reading> = {
    sensor: claimed,
    unregister: () => undefined,
    isAvailable: false,
    config,
  };
  return {
    output,
    start: () => {
      const adjustToInterfaceOrientation = config.adjustToInterfaceOrientation;
      const id = registerSensor(sensorType, config, data => {
        'worklet';
        if (adjustToInterfaceOrientation) {
          data = isRotation(data)
            ? adjustRotationToInterfaceOrientation(data)
            : adjustVectorToInterfaceOrientation(data);
        }
        sensorData.value = data;
      });
      output.isAvailable = id !== -1;
      output.unregister =
        id === -1 ? () => undefined : () => unregisterSensor(id);
      return () => output.unregister();
    },
  };
}
