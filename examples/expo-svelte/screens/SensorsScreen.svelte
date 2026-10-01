<script lang="ts">
  // The four sensor singletons come from the package root, `/svelte` re-exports only the runes
  import {
    Accelerometer,
    DeviceMotion,
    Gyroscope,
    Magnetometer,
  } from '@symbiote-native/sensors';
  import {
    isAvailableAsync as isPedometerAvailableAsync,
    useAccelerometer,
    useDeviceMotion,
    useGyroscope,
    useMagnetometer,
    usePedometer,
  } from '@symbiote-native/sensors/svelte';
  import Scenario from '../components/Scenario.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
  import AxisReadingRow from './AxisReadingRow.svelte';
  import SensorCard from './SensorCard.svelte';
  import { SENSOR_AVAILABILITY, resolveSensorStatus } from './sensor-status';
  import type { ISensorAvailability, ISensorStatus } from './sensor-status';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sensors];

  type IStatusBox = { readonly current: ISensorStatus };

  // Boxed getter, a bare `$state` returned from a function arrives dead at the caller
  function useSensorStatus(
    checkAsync: () => Promise<boolean>,
    hasReading: () => boolean,
  ): IStatusBox {
    let availability = $state<ISensorAvailability>(SENSOR_AVAILABILITY.checking);
    // Only writes `availability` from an async continuation, so the effect runs once on mount
    $effect(() => {
      void checkAsync().then(isAvailable => {
        availability = isAvailable
          ? SENSOR_AVAILABILITY.available
          : SENSOR_AVAILABILITY.unavailable;
      });
    });
    const status = $derived(resolveSensorStatus(availability, hasReading()));
    return {
      get current(): ISensorStatus {
        return status;
      },
    };
  }

  const accelerometer = useAccelerometer();
  const accelerometerStatus = useSensorStatus(
    () => Accelerometer.isAvailableAsync(),
    () => accelerometer.current !== null,
  );

  const gyroscope = useGyroscope();
  const gyroscopeStatus = useSensorStatus(
    () => Gyroscope.isAvailableAsync(),
    () => gyroscope.current !== null,
  );

  const magnetometer = useMagnetometer();
  const magnetometerStatus = useSensorStatus(
    () => Magnetometer.isAvailableAsync(),
    () => magnetometer.current !== null,
  );

  const deviceMotion = useDeviceMotion();
  const deviceMotionStatus = useSensorStatus(
    () => DeviceMotion.isAvailableAsync(),
    () => deviceMotion.current !== null,
  );

  const pedometer = usePedometer();
  const pedometerStatus = useSensorStatus(
    () => isPedometerAvailableAsync(),
    () => pedometer.current !== null,
  );
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="sensors-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: LINE_COLOR.sensors }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Sensors</text>
        <text class="hero-body">
          Read the phone's motion hardware live: accelerometer, gyroscope,
          magnetometer, combined device motion and step counter. A simulator
          reports every sensor as unavailable, use a real device.
        </text>
      </view>
    </view>

    <Scenario
      testID="sensors-scenario"
      title="Detect a shake, a tilt, a compass heading or a step"
      why="Games, level tools and fitness features read the motion sensors: tilt to steer, shake to undo, magnetometer for a compass and the pedometer for steps."
      steps={[
        'Tilt and shake the phone and watch the accelerometer',
        'Rotate it and watch the gyroscope',
        'Walk a few steps and watch the pedometer',
      ]}
      expect="The numbers change live with each movement. A card that says unavailable means the device has no such sensor or the simulator cannot provide it."
    />

    <SensorCard
      testID="sensors-accelerometer"
      title="Accelerometer"
      status={accelerometerStatus.current}
    >
      {#if accelerometer.current}
        <AxisReadingRow measurement={accelerometer.current} />
      {/if}
    </SensorCard>

    <SensorCard
      testID="sensors-gyroscope"
      title="Gyroscope"
      status={gyroscopeStatus.current}
    >
      {#if gyroscope.current}
        <AxisReadingRow measurement={gyroscope.current} />
      {/if}
    </SensorCard>

    <SensorCard
      testID="sensors-magnetometer"
      title="Magnetometer"
      status={magnetometerStatus.current}
    >
      {#if magnetometer.current}
        <AxisReadingRow measurement={magnetometer.current} />
      {/if}
    </SensorCard>

    <SensorCard
      testID="sensors-device-motion"
      title="Device motion"
      status={deviceMotionStatus.current}
    >
      {#if deviceMotion.current}
        <text class="info-text">
          {`interval: ${deviceMotion.current.interval.toFixed(1)}ms`}
        </text>
      {/if}
      {#if deviceMotion.current?.rotation}
        <view class="sensor-reading-row">
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">ALPHA</text>
            <text class="sensor-reading-value">
              {deviceMotion.current.rotation.alpha.toFixed(3)}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">BETA</text>
            <text class="sensor-reading-value">
              {deviceMotion.current.rotation.beta.toFixed(3)}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">GAMMA</text>
            <text class="sensor-reading-value">
              {deviceMotion.current.rotation.gamma.toFixed(3)}
            </text>
          </view>
        </view>
      {/if}
    </SensorCard>

    <SensorCard
      testID="sensors-pedometer"
      title="Pedometer"
      status={pedometerStatus.current}
    >
      {#if pedometer.current}
        <text testID="sensors-pedometer-steps" class="sensor-reading-value">
          {`${pedometer.current.steps} steps`}
        </text>
      {/if}
    </SensorCard>
  </scroll-view>
</safe-area-view>
