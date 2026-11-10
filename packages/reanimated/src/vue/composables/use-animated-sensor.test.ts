import { installRecordingFabric } from '@symbiote-native/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SensorType } from 'react-native-reanimated/src/commonTypes';
import * as core from 'react-native-reanimated/src/core';
import { renderComposable } from '../../../test-support/render-composable';
import { useAnimatedSensor } from './use-animated-sensor';

installRecordingFabric();

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
  registerSensor.mockReturnValue(4);
});

describe('useAnimatedSensor', () => {
  it('registers the sensor with the device once mounted', () => {
    renderComposable(() => useAnimatedSensor(SensorType.GYROSCOPE));

    expect(registerSensor).toHaveBeenCalledWith(
      SensorType.GYROSCOPE,
      expect.objectContaining({ interval: 'auto' }),
      expect.any(Function),
    );
  });

  it('is available when the device has the sensor, and not when it lacks it', () => {
    const has = renderComposable(() => useAnimatedSensor(SensorType.GYROSCOPE));
    registerSensor.mockReturnValue(-1);
    const lacks = renderComposable(() =>
      useAnimatedSensor(SensorType.GYROSCOPE),
    );

    expect(has.result().isAvailable).toBe(true);
    expect(lacks.result().isAvailable).toBe(false);
  });

  it('unregisters once the component is gone', () => {
    const composable = renderComposable(() =>
      useAnimatedSensor(SensorType.GYROSCOPE),
    );

    composable.unmount();

    expect(unregisterSensor).toHaveBeenCalledWith(4);
  });

  it('registers with the interval it was given', () => {
    renderComposable(() =>
      useAnimatedSensor(SensorType.GYROSCOPE, { interval: 100 }),
    );

    expect(registerSensor).toHaveBeenCalledWith(
      SensorType.GYROSCOPE,
      expect.objectContaining({ interval: 100 }),
      expect.any(Function),
    );
  });
});
