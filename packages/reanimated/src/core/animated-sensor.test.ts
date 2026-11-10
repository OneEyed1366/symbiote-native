import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InterfaceOrientation,
  IOSReferenceFrame,
  SensorType,
} from 'react-native-reanimated/src/commonTypes';
import * as core from 'react-native-reanimated/src/core';
import { createAnimatedSensor, isSameSensorConfig } from './animated-sensor';

vi.mock('react-native-reanimated/src/core', async importOriginal => ({
  ...(await importOriginal<typeof core>()),
  registerSensor: vi.fn(),
  unregisterSensor: vi.fn(),
}));

const registerSensor = vi.mocked(core.registerSensor);
const unregisterSensor = vi.mocked(core.unregisterSensor);

beforeEach(() => {
  registerSensor.mockReset();
  unregisterSensor.mockReset();
});

function vector(x: number, y: number, orientation: InterfaceOrientation) {
  return { x, y, z: 0, interfaceOrientation: orientation };
}

function delivered() {
  const call = registerSensor.mock.calls[0];
  if (call === undefined) throw new Error('the sensor was never registered');
  return call[2];
}

describe('an animated sensor made by the controller', () => {
  it('registers with the type and the default configuration once started', () => {
    registerSensor.mockReturnValue(4);

    createAnimatedSensor(SensorType.GYROSCOPE).start();

    expect(registerSensor).toHaveBeenCalledWith(
      SensorType.GYROSCOPE,
      {
        interval: 'auto',
        adjustToInterfaceOrientation: true,
        iosReferenceFrame: IOSReferenceFrame.Auto,
      },
      expect.any(Function),
    );
  });

  it('does not touch the device before it is started', () => {
    createAnimatedSensor(SensorType.GYROSCOPE);

    expect(registerSensor).not.toHaveBeenCalled();
  });

  it('is available, and unregisters by its id, when the device has the sensor', () => {
    registerSensor.mockReturnValue(4);
    const animated = createAnimatedSensor(SensorType.GYROSCOPE);

    animated.start();
    animated.output.unregister();

    expect(animated.output.isAvailable).toBe(true);
    expect(unregisterSensor).toHaveBeenCalledWith(4);
  });

  it('is unavailable, with nothing to unregister, when the device lacks the sensor', () => {
    registerSensor.mockReturnValue(-1);
    const animated = createAnimatedSensor(SensorType.GYROSCOPE);

    animated.start();
    animated.output.unregister();

    expect(animated.output.isAvailable).toBe(false);
    expect(unregisterSensor).not.toHaveBeenCalled();
  });

  it('unregisters when stopped', () => {
    registerSensor.mockReturnValue(4);
    const animated = createAnimatedSensor(SensorType.GYROSCOPE);

    animated.start()();

    expect(unregisterSensor).toHaveBeenCalledWith(4);
  });

  it('keeps what the device reports as it is, when it is not adjusted to the orientation', () => {
    registerSensor.mockReturnValue(4);
    const animated = createAnimatedSensor(SensorType.GYROSCOPE, {
      adjustToInterfaceOrientation: false,
    });
    animated.start();

    delivered()(vector(1, 2, InterfaceOrientation.ROTATION_90), 0);

    expect(animated.output.sensor.value).toMatchObject({ x: 1, y: 2 });
  });

  it('turns a vector with the interface, when it is adjusted', () => {
    registerSensor.mockReturnValue(4);
    const animated = createAnimatedSensor(SensorType.GYROSCOPE);
    animated.start();

    delivered()(vector(1, 2, InterfaceOrientation.ROTATION_90), 0);

    expect(animated.output.sensor.value).toMatchObject({ x: -2, y: 1 });
  });

  it('turns a rotation with the interface and adds its quaternion, when it is adjusted', () => {
    registerSensor.mockReturnValue(4);
    const animated = createAnimatedSensor(SensorType.ROTATION);
    animated.start();

    delivered()(
      {
        qw: 0,
        qx: 0,
        qy: 0,
        qz: 0,
        yaw: 0,
        pitch: 0.5,
        roll: 0.25,
        interfaceOrientation: InterfaceOrientation.ROTATION_180,
      },
      0,
    );

    const reading = animated.output.sensor.value;
    expect(reading).toMatchObject({ pitch: -0.5, roll: -0.25 });
    // With no yaw the scalar part is cos(pitch / 2) * cos(roll / 2)
    expect(reading).toHaveProperty(
      'qw',
      expect.closeTo(Math.cos(-0.25) * Math.cos(-0.125), 5),
    );
  });
});

describe('the configuration of an animated sensor', () => {
  it('is the same while the three settings it reacts to are the same', () => {
    expect(isSameSensorConfig({ interval: 100 }, { interval: 100 })).toBe(true);
  });

  it('differs as soon as one of them differs', () => {
    expect(isSameSensorConfig({ interval: 100 }, { interval: 200 })).toBe(
      false,
    );
    expect(
      isSameSensorConfig(undefined, { adjustToInterfaceOrientation: false }),
    ).toBe(false);
  });
});
