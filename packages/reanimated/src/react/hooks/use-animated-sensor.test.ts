import { installRecordingFabric } from '@symbiote-native/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SensorType } from 'react-native-reanimated/src/commonTypes';
import * as core from 'react-native-reanimated/src/core';
import { renderHook } from '../../../test-support/render-hook';
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
    renderHook(() => useAnimatedSensor(SensorType.GYROSCOPE), undefined);

    expect(registerSensor).toHaveBeenCalledWith(
      SensorType.GYROSCOPE,
      expect.objectContaining({ interval: 'auto' }),
      expect.any(Function),
    );
  });

  it('is available when the device has the sensor, and not when it lacks it', () => {
    const has = renderHook(
      () => useAnimatedSensor(SensorType.GYROSCOPE),
      undefined,
    );
    registerSensor.mockReturnValue(-1);
    const lacks = renderHook(
      () => useAnimatedSensor(SensorType.GYROSCOPE),
      undefined,
    );

    expect(has.latest().isAvailable).toBe(true);
    expect(lacks.latest().isAvailable).toBe(false);
  });

  it('unregisters once the component is gone', () => {
    const hook = renderHook(
      () => useAnimatedSensor(SensorType.GYROSCOPE),
      undefined,
    );

    hook.unmount();

    expect(unregisterSensor).toHaveBeenCalledWith(4);
  });

  it('is the same sensor on every render while the configuration stays the same', () => {
    const hook = renderHook(
      () => useAnimatedSensor(SensorType.GYROSCOPE, { interval: 100 }),
      undefined,
    );
    const first = hook.latest();

    hook.rerender(undefined);

    expect(hook.latest()).toBe(first);
    expect(registerSensor).toHaveBeenCalledTimes(1);
  });

  it('registers again, with the new interval, once the configuration changes', () => {
    const hook = renderHook(
      (interval: number) =>
        useAnimatedSensor(SensorType.GYROSCOPE, { interval }),
      100,
    );

    hook.rerender(200);

    expect(registerSensor).toHaveBeenCalledTimes(2);
    expect(registerSensor).toHaveBeenLastCalledWith(
      SensorType.GYROSCOPE,
      expect.objectContaining({ interval: 200 }),
      expect.any(Function),
    );
    expect(unregisterSensor).toHaveBeenCalledTimes(1);
  });
});
